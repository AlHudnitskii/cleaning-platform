import asyncio
import uuid
from datetime import datetime, timedelta
import random
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import bcrypt

DATABASE_URL = "postgresql+asyncpg://cleaning_user:cleaning_pass@localhost:5433/cleaning_db"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


USERS = [
    {"email": "admin@cleaning.com", "password": "admin123", "role": "admin", "country": None},
    {"email": "manager.de@cleaning.com", "password": "manager123", "role": "manager", "country": "DE"},
    {"email": "manager.nl@cleaning.com", "password": "manager123", "role": "manager", "country": "NL"},
    {"email": "cleaner1@cleaning.com", "password": "cleaner123", "role": "cleaner", "country": "DE"},
    {"email": "cleaner2@cleaning.com", "password": "cleaner123", "role": "cleaner", "country": "DE"},
    {"email": "cleaner3@cleaning.com", "password": "cleaner123", "role": "cleaner", "country": "NL"},
]

LOCATIONS = [
    ("Germany", "DE", "country", None),
    ("Berlin", "DE", "city", "Germany"),
    ("Munich", "DE", "city", "Germany"),
    ("Berlin HQ", "DE", "building", "Berlin"),
    ("Berlin Annex", "DE", "building", "Berlin"),
    ("Munich Office", "DE", "building", "Munich"),
    ("Floor 1", "DE", "floor", "Berlin HQ"),
    ("Floor 2", "DE", "floor", "Berlin HQ"),
    ("Room 101", "DE", "room", "Floor 1"),
    ("Room 102", "DE", "room", "Floor 1"),
    ("Room 201", "DE", "room", "Floor 2"),
    ("Netherlands", "NL", "country", None),
    ("Amsterdam", "NL", "city", "Netherlands"),
    ("Amsterdam Tower", "NL", "building", "Amsterdam"),
    ("Floor A", "NL", "floor", "Amsterdam Tower"),
    ("Room A1", "NL", "room", "Floor A"),
    ("Room A2", "NL", "room", "Floor A"),
    ("United States", "US", "country", None),
    ("New York", "US", "city", "United States"),
    ("NY Plaza", "US", "building", "New York"),
    ("Floor 10", "US", "floor", "NY Plaza"),
    ("Room 1001", "US", "room", "Floor 10"),
]

TASK_TEMPLATES = [
    {"title": "Clean lobby", "description": "Daily lobby cleaning", "priority": "high"},
    {"title": "Vacuum carpets", "description": "Vacuum all carpeted areas", "priority": "normal"},
    {"title": "Clean restrooms", "description": "Sanitize all restrooms", "priority": "urgent"},
    {"title": "Empty trash bins", "description": "Empty and replace bin liners", "priority": "normal"},
    {"title": "Wipe down surfaces", "description": "Clean all desk surfaces", "priority": "low"},
    {"title": "Mop hard floors", "description": "Mop all hard floor areas", "priority": "normal"},
    {"title": "Clean windows", "description": "Interior window cleaning", "priority": "low"},
    {"title": "Sanitize kitchen", "description": "Deep clean kitchen area", "priority": "high"},
    {"title": "Restock supplies", "description": "Refill soap and paper towels", "priority": "normal"},
    {"title": "Deep clean conference", "description": "Full conference room clean", "priority": "high"},
]

STATUSES = ["pending", "in_progress", "completed", "completed", "completed"]

RECURRING_TASKS = [
    {"title": "Daily lobby check", "rrule": "FREQ=DAILY", "country": "DE", "priority": "high"},
    {"title": "Weekly deep clean", "rrule": "FREQ=WEEKLY;BYDAY=MO", "country": "DE", "priority": "normal"},
    {"title": "Mon-Wed-Fri vacuum", "rrule": "FREQ=WEEKLY;BYDAY=MO,WE,FR", "country": "NL", "priority": "normal"},
]


def build_path(parent_path: str | None, name: str) -> str:
    safe = name.replace(" ", "_").replace("-", "_")
    return f"{parent_path}.{safe}" if parent_path else safe


def random_date(days_back_min: int, days_back_max: int) -> datetime:
    now = datetime.utcnow()
    delta = random.randint(days_back_min, days_back_max)
    return now - timedelta(days=delta, hours=random.randint(0, 23), minutes=random.randint(0, 59))


async def cleanup(session: AsyncSession):
    print("Cleaning database...")
    await session.execute(text("DELETE FROM task_comments"))
    await session.execute(text("DELETE FROM task_status_history"))
    await session.execute(text("DELETE FROM task_photos"))
    await session.execute(text("DELETE FROM push_subscriptions"))
    await session.execute(text("DELETE FROM tasks"))
    await session.execute(text("DELETE FROM locations"))
    await session.execute(text("DELETE FROM users"))
    await session.commit()
    print("Done\n")


async def create_users(session: AsyncSession) -> dict[str, uuid.UUID]:
    print("Creating users...")
    user_ids = {}
    for u in USERS:
        uid = uuid.uuid4()
        await session.execute(text("""
            INSERT INTO users (id, email, hashed_password, role, country, is_active, created_at)
            VALUES (:id, :email, :pw, :role, :country, true, :now)
        """), {
            "id": uid, "email": u["email"],
            "pw": hash_password(u["password"]),
            "role": u["role"], "country": u["country"],
            "now": datetime.utcnow()
        })
        user_ids[u["email"]] = uid
        print(f"   {u['role']:8} {u['email']}")
    await session.commit()
    return user_ids


async def create_locations(session: AsyncSession) -> dict[str, dict]:
    print("\nCreating locations...")
    loc_map: dict[str, dict] = {}

    for name, country, level, parent_key in LOCATIONS:
        parent_path = loc_map[parent_key]["path"] if parent_key else None
        path = build_path(parent_path, name)
        parent_id = loc_map[parent_key]["id"] if parent_key else None
        lid = uuid.uuid4()

        await session.execute(text("""
            INSERT INTO locations (id, name, country, path, level, parent_id, created_at)
            VALUES (:id, :name, :country, :path, :level, :parent_id, :now)
        """), {
            "id": lid, "name": name, "country": country,
            "path": path, "level": level,
            "parent_id": parent_id, "now": datetime.utcnow()
        })

        loc_map[name] = {"id": lid, "path": path, "country": country}
        indent = "   " + "  " * (["country", "city", "building", "floor", "room"].index(level))
        print(f"{indent}[{level}] {name}")

    await session.commit()
    return loc_map


async def create_tasks(session: AsyncSession, user_ids: dict, loc_map: dict):
    print("\nCreating tasks...")
    random.seed(42)

    rooms = [v for k, v in loc_map.items() if k.startswith("Room") or k.startswith("Floor")]
    cleaners_de = [uid for email, uid in user_ids.items() if "cleaner1" in email or "cleaner2" in email]
    cleaners_nl = [uid for email, uid in user_ids.items() if "cleaner3" in email]
    manager_id = user_ids["manager.de@cleaning.com"]

    count = 0
    for i, tmpl in enumerate(TASK_TEMPLATES):
        for loc in random.sample(rooms, min(4, len(rooms))):
            status = random.choice(STATUSES)
            country = loc["country"]
            cleaners = cleaners_de if country == "DE" else cleaners_nl
            assigned = random.choice(cleaners) if cleaners else None

            task_id = uuid.uuid4()

            # половина задач за последние 7 дней, половина — за последние 60
            if i % 2 == 0:
                created_at = random_date(0, 6)
            else:
                created_at = random_date(7, 60)

            await session.execute(text("""
                INSERT INTO tasks
                    (id, title, description, status, country, location_id,
                     assigned_to, priority, is_recurring, created_at)
                VALUES
                    (:id, :title, :desc, :status, :country, :loc_id,
                     :assigned, :priority, false, :now)
            """), {
                "id": task_id, "title": tmpl["title"], "desc": tmpl["description"],
                "status": status, "country": country, "loc_id": loc["id"],
                "assigned": assigned, "priority": tmpl["priority"], "now": created_at
            })

            await session.execute(text("""
                INSERT INTO task_status_history
                    (id, task_id, old_status, new_status, changed_by, changed_at)
                VALUES (:id, :tid, NULL, 'pending', :by, :at)
            """), {"id": uuid.uuid4(), "tid": task_id, "by": assigned, "at": created_at})

            if status in ("in_progress", "completed"):
                await session.execute(text("""
                    INSERT INTO task_status_history
                        (id, task_id, old_status, new_status, changed_by, changed_at)
                    VALUES (:id, :tid, 'pending', 'in_progress', :by, :at)
                """), {
                    "id": uuid.uuid4(), "tid": task_id, "by": assigned,
                    "at": created_at + timedelta(hours=1)
                })

            if status == "completed":
                await session.execute(text("""
                    INSERT INTO task_status_history
                        (id, task_id, old_status, new_status, changed_by, changed_at)
                    VALUES (:id, :tid, 'in_progress', 'completed', :by, :at)
                """), {
                    "id": uuid.uuid4(), "tid": task_id, "by": manager_id,
                    "at": created_at + timedelta(hours=2)
                })

                await session.execute(text("""
                    UPDATE tasks SET
                        quality_score = :score,
                        quality_comment = :comment,
                        quality_reviewed_by = :by,
                        quality_reviewed_at = :at
                    WHERE id = :id
                """), {
                    "score": random.randint(3, 5),
                    "comment": random.choice(["Good job!", "Well done", "Acceptable", "Excellent work"]),
                    "by": manager_id,
                    "at": created_at + timedelta(hours=3),
                    "id": task_id
                })

            count += 1

    await session.commit()
    print(f"   {count} tasks created")

    print("\nCreating recurring tasks...")
    for rt in RECURRING_TASKS:
        await session.execute(text("""
            INSERT INTO tasks
                (id, title, status, country, rrule, is_recurring, priority, created_at)
            VALUES
                (:id, :title, 'pending', :country, :rrule, true, :priority, :now)
        """), {
            "id": uuid.uuid4(), "title": rt["title"],
            "country": rt["country"], "rrule": rt["rrule"],
            "priority": rt["priority"], "now": datetime.utcnow()
        })
        print(f"   {rt['title']} ({rt['rrule']})")

    await session.commit()


async def main():
    print("Seeding database...\n")
    async with AsyncSessionLocal() as session:
        await cleanup(session)
        user_ids = await create_users(session)
        loc_map = await create_locations(session)
        await create_tasks(session, user_ids, loc_map)

    print("\nDone! Test accounts:")
    print("   admin@cleaning.com      / admin123")
    print("   manager.de@cleaning.com / manager123  (Germany)")
    print("   manager.nl@cleaning.com / manager123  (Netherlands)")
    print("   cleaner1@cleaning.com   / cleaner123  (Germany)")
    print("   cleaner2@cleaning.com   / cleaner123  (Germany)")
    print("   cleaner3@cleaning.com   / cleaner123  (Netherlands)")


if __name__ == "__main__":
    asyncio.run(main())
