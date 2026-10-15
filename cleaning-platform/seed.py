import asyncio
import random
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.models.enums import LocationLevel, TaskStatus
from src.domain.services.locations import build_path
from src.infrastructure.auth.jwt_handler import hash_password
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import (
    Location,
    OutboxMessage,
    PushSubscription,
    Task,
    TaskComment,
    TaskPhoto,
    TaskStatusHistory,
    User,
)

USERS = [
    ("admin@cleaning.com", "admin123", "admin", None),
    ("manager.de@cleaning.com", "manager123", "manager", "DE"),
    ("manager.nl@cleaning.com", "manager123", "manager", "NL"),
    ("cleaner1@cleaning.com", "cleaner123", "cleaner", "DE"),
    ("cleaner2@cleaning.com", "cleaner123", "cleaner", "DE"),
    ("cleaner3@cleaning.com", "cleaner123", "cleaner", "NL"),
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
    ("Clean lobby", "Daily lobby cleaning", "high"),
    ("Vacuum carpets", "Vacuum all carpeted areas", "normal"),
    ("Clean restrooms", "Sanitize all restrooms", "urgent"),
    ("Empty trash bins", "Empty and replace bin liners", "normal"),
    ("Wipe down surfaces", "Clean all desk surfaces", "low"),
    ("Mop hard floors", "Mop all hard floor areas", "normal"),
    ("Clean windows", "Interior window cleaning", "low"),
    ("Sanitize kitchen", "Deep clean kitchen area", "high"),
    ("Restock supplies", "Refill soap and paper towels", "normal"),
    ("Deep clean conference", "Full conference room clean", "high"),
]

S = TaskStatus
STATUS_PATHS = [
    [S.PENDING],
    [S.PENDING, S.IN_PROGRESS],
    [S.PENDING, S.IN_PROGRESS, S.ON_REVIEW],
    [S.PENDING, S.IN_PROGRESS, S.ON_REVIEW, S.COMPLETED],
    [S.PENDING, S.IN_PROGRESS, S.ON_REVIEW, S.COMPLETED],
]

RECURRING_TASKS = [
    ("Daily lobby check", "FREQ=DAILY", "DE", "high"),
    ("Weekly deep clean", "FREQ=WEEKLY;BYDAY=MO", "DE", "normal"),
    ("Mon-Wed-Fri vacuum", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "NL", "normal"),
]

QUALITY_COMMENTS = ["Good job!", "Well done", "Acceptable", "Excellent work"]


def random_moment(rng: random.Random, days_min: int, days_max: int) -> datetime:
    delta = timedelta(days=rng.randint(days_min, days_max), hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
    return datetime.now(UTC) - delta


async def cleanup(session: AsyncSession) -> None:
    for model in (OutboxMessage, TaskComment, TaskStatusHistory, TaskPhoto, PushSubscription, Task, Location, User):
        await session.execute(delete(model))


def create_users(session: AsyncSession) -> dict[str, User]:
    users = {}
    for email, password, role, country in USERS:
        user = User(email=email, hashed_password=hash_password(password), role=role, country=country)
        session.add(user)
        users[email] = user
    return users


def create_locations(session: AsyncSession) -> dict[str, Location]:
    locations: dict[str, Location] = {}
    for name, country, level, parent_name in LOCATIONS:
        parent = locations[parent_name] if parent_name else None
        location_id = uuid.uuid4()
        location = Location(
            id=location_id,
            name=name,
            country=country,
            level=LocationLevel(level),
            parent_id=parent.id if parent else None,
            path=build_path(str(parent.path) if parent else None, location_id),
        )
        session.add(location)
        locations[name] = location
    return locations


def create_tasks(session: AsyncSession, users: dict[str, User], locations: dict[str, Location]) -> int:
    rng = random.Random(42)
    rooms = [loc for name, loc in locations.items() if name.startswith(("Room", "Floor"))]
    cleaners = {
        "DE": [users["cleaner1@cleaning.com"], users["cleaner2@cleaning.com"]],
        "NL": [users["cleaner3@cleaning.com"]],
    }
    managers = {"DE": users["manager.de@cleaning.com"], "NL": users["manager.nl@cleaning.com"]}
    admin = users["admin@cleaning.com"]

    count = 0
    for index, (title, description, priority) in enumerate(TASK_TEMPLATES):
        for location in rng.sample(rooms, min(4, len(rooms))):
            country = location.country
            assignee = rng.choice(cleaners[country]) if country in cleaners else None
            reviewer = managers.get(country, admin)
            created_at = random_moment(rng, 0, 6) if index % 2 == 0 else random_moment(rng, 7, 60)
            path = rng.choice(STATUS_PATHS)

            task = Task(
                id=uuid.uuid4(),
                title=title,
                description=description,
                status=path[-1],
                country=country,
                location_id=location.id,
                assigned_to=assignee.id if assignee else None,
                priority=priority,
                created_at=created_at,
            )
            session.add(task)

            previous = None
            for step, status in enumerate(path):
                changed_by = reviewer if status == S.COMPLETED or assignee is None else assignee
                session.add(
                    TaskStatusHistory(
                        task_id=task.id,
                        old_status=previous,
                        new_status=status,
                        changed_by=changed_by.id,
                        changed_at=created_at + timedelta(hours=step),
                    )
                )
                previous = status

            if path[-1] == S.COMPLETED:
                task.quality_score = rng.randint(3, 5)
                task.quality_comment = rng.choice(QUALITY_COMMENTS)
                task.quality_reviewed_by = reviewer.id
                task.quality_reviewed_at = created_at + timedelta(hours=len(path))
            count += 1

    for title, rrule, country, priority in RECURRING_TASKS:
        session.add(
            Task(title=title, status=S.PENDING, country=country, rrule=rrule, is_recurring=True, priority=priority)
        )
    return count


async def main() -> None:
    async with session_scope() as session, session.begin():
        await cleanup(session)
        users = create_users(session)
        await session.flush()
        locations = create_locations(session)
        await session.flush()
        task_count = create_tasks(session, users, locations)

    print(f"Seeded {len(USERS)} users, {len(LOCATIONS)} locations, {task_count + len(RECURRING_TASKS)} tasks")
    for email, password, role, country in USERS:
        print(f"  {role:8} {email:28} {password}  {country or ''}")


if __name__ == "__main__":
    asyncio.run(main())
