import pytest
from sqlalchemy import select

from src.api import auth, locations, users
from src.domain.services.login_throttle import MAX_FAILURES
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Location, PushSubscription
from tests.integration.conftest import call, payload

pytestmark = pytest.mark.integration

PASSWORD = "secret123"


async def login(email: str, password: str = PASSWORD):
    return await call(auth.login, "POST", json_body={"email": email, "password": password})


async def subscribe_device(user_id) -> None:
    async with session_scope() as session, session.begin():
        session.add(PushSubscription(user_id=user_id, endpoint=f"https://push.example/{user_id}", p256dh="k", auth="a"))


async def test_repeated_wrong_passwords_lock_the_account_for_a_while(account):
    cleaner = await account("cleaner", "DE", PASSWORD)
    for _ in range(MAX_FAILURES):
        assert (await login(cleaner.user.email, "wrong")).status_code == 401

    locked = await login(cleaner.user.email.upper())

    assert locked.status_code == 429
    retry = int(locked.headers["Retry-After"])
    assert 0 < retry <= 15 * 60
    assert payload(locked)["retry_after"] == retry


async def test_unknown_emails_are_throttled_the_same_way():
    for _ in range(MAX_FAILURES):
        assert (await login("nobody@example.com", "wrong")).status_code == 401

    assert (await login("nobody@example.com", "wrong")).status_code == 429


async def test_a_successful_sign_in_resets_the_counter_and_other_accounts_are_unaffected(account):
    cleaner = await account("cleaner", "DE", PASSWORD)
    other = await account("cleaner", "DE", PASSWORD)
    for _ in range(MAX_FAILURES - 1):
        await login(cleaner.user.email, "wrong")

    assert (await login(cleaner.user.email)).status_code == 200
    for _ in range(MAX_FAILURES - 1):
        await login(cleaner.user.email, "wrong")

    assert (await login(cleaner.user.email)).status_code == 200
    assert (await login(other.user.email)).status_code == 200


async def test_admin_edits_email_role_and_country(account):
    admin = await account("admin", None)
    manager = await account("manager", "DE")

    response = await call(
        users.update_user,
        "PATCH",
        headers=admin.headers,
        route={"user_id": str(manager.user.id)},
        json_body={"email": "lead@example.com", "role": "manager", "country": "NL"},
    )

    assert response.status_code == 200
    body = payload(response)
    assert (body["email"], body["role"], body["country"]) == ("lead@example.com", "manager", "NL")
    assert (await call(auth.me, "GET", headers=manager.headers)).status_code == 401


async def test_editing_only_the_email_keeps_the_user_signed_in(account):
    admin = await account("admin", None)
    cleaner = await account("cleaner", "DE")

    await call(
        users.update_user,
        "PATCH",
        headers=admin.headers,
        route={"user_id": str(cleaner.user.id)},
        json_body={"email": "renamed@example.com", "role": "cleaner", "country": "DE"},
    )

    assert payload(await call(auth.me, "GET", headers=cleaner.headers))["email"] == "renamed@example.com"


@pytest.mark.parametrize(
    ("body", "status", "message"),
    [
        ({"role": "cleaner", "country": "DE"}, 400, "You cannot change your own role or country"),
        ({"role": "manager", "country": None}, 400, "Please check the entered values"),
    ],
)
async def test_invalid_edits_are_rejected(account, body, status, message):
    admin = await account("admin", None)

    response = await call(
        users.update_user,
        "PATCH",
        headers=admin.headers,
        route={"user_id": str(admin.user.id)},
        json_body={"email": admin.user.email, **body},
    )

    assert response.status_code == status
    assert payload(response)["error"] == message


async def test_email_must_stay_unique(account):
    admin = await account("admin", None)
    first = await account("cleaner", "DE")
    second = await account("cleaner", "DE")

    response = await call(
        users.update_user,
        "PATCH",
        headers=admin.headers,
        route={"user_id": str(second.user.id)},
        json_body={"email": first.user.email, "role": "cleaner", "country": "DE"},
    )

    assert response.status_code == 409


async def test_a_cleaner_with_open_tasks_keeps_their_country_until_the_tasks_move(account, task_factory):
    admin = await account("admin", None)
    cleaner = await account("cleaner", "DE")
    await task_factory(assigned_to=cleaner.user.id)
    await task_factory(assigned_to=cleaner.user.id, status="completed")

    response = await call(
        users.update_user,
        "PATCH",
        headers=admin.headers,
        route={"user_id": str(cleaner.user.id)},
        json_body={"email": cleaner.user.email, "role": "cleaner", "country": "NL"},
    )

    assert response.status_code == 409
    assert payload(response)["error"] == "Reassign this cleaner's open tasks first (1)"


async def test_admin_resets_a_password_and_signs_the_user_out_everywhere(account):
    admin = await account("admin", None)
    cleaner = await account("cleaner", "DE", PASSWORD)
    await subscribe_device(cleaner.user.id)

    response = await call(
        users.reset_password,
        "POST",
        headers=admin.headers,
        route={"user_id": str(cleaner.user.id)},
        json_body={"new_password": "temporary1"},
    )

    assert response.status_code == 204
    assert (await call(auth.me, "GET", headers=cleaner.headers)).status_code == 401
    assert (await login(cleaner.user.email)).status_code == 401
    assert (await login(cleaner.user.email, "temporary1")).status_code == 200
    async with session_scope() as session:
        assert await session.scalar(select(PushSubscription.id)) is None


@pytest.mark.parametrize("role", ["manager", "cleaner"])
async def test_only_admins_manage_users_and_locations(account, location_factory, role):
    caller = await account(role, "DE")
    target = await account("cleaner", "DE")
    room = await location_factory("Room 1", "DE", "country")
    calls = [
        (
            users.update_user,
            "PATCH",
            {"user_id": str(target.user.id)},
            {"email": "x@example.com", "role": "cleaner", "country": "DE"},
        ),
        (users.reset_password, "POST", {"user_id": str(target.user.id)}, {"new_password": "temporary1"}),
        (locations.rename_location, "PATCH", {"location_id": str(room.id)}, {"name": "Renamed"}),
        (locations.delete_location, "DELETE", {"location_id": str(room.id)}, None),
    ]

    for handler, method, route, body in calls:
        response = await call(handler, method, headers=caller.headers, route=route, json_body=body)
        assert response.status_code == 403, handler.__name__


async def test_admin_cannot_reset_their_own_password_here(account):
    admin = await account("admin", None)

    response = await call(
        users.reset_password,
        "POST",
        headers=admin.headers,
        route={"user_id": str(admin.user.id)},
        json_body={"new_password": "temporary1"},
    )

    assert response.status_code == 400


async def test_renaming_a_location_renames_it_in_its_children(account, location_factory):
    admin = await account("admin", None)
    germany = await location_factory("Germany", "DE", "country")
    berlin = await location_factory("Berlin", "DE", "city", germany)
    await location_factory("Office", "DE", "building", berlin)

    response = await call(
        locations.rename_location,
        "PATCH",
        headers=admin.headers,
        route={"location_id": str(berlin.id)},
        json_body={"name": "  Berlin Mitte "},
    )

    assert response.status_code == 200
    assert payload(response)["name"] == "Berlin Mitte"
    listed = payload(await call(locations.get_locations, "GET", headers=admin.headers))
    names = {loc["full_name"] for loc in listed}
    assert names == {"Germany", "Germany / Berlin Mitte", "Germany / Berlin Mitte / Office"}


async def test_a_location_is_deleted_only_when_nothing_depends_on_it(account, location_factory, task_factory):
    admin = await account("admin", None)
    germany = await location_factory("Germany", "DE", "country")
    berlin = await location_factory("Berlin", "DE", "city", germany)
    office = await location_factory("Office", "DE", "building", berlin)
    await task_factory(location_id=office.id)

    async def delete(location: Location):
        route = {"location_id": str(location.id)}
        return await call(locations.delete_location, "DELETE", headers=admin.headers, route=route)

    with_children = await delete(berlin)
    with_tasks = await delete(office)
    empty = await delete(await location_factory("Spare room", "DE", "room", berlin))

    assert with_children.status_code == 409
    assert payload(with_children)["error"] == "Delete or move the nested locations first"
    assert (with_tasks.status_code, payload(with_tasks)["error"]) == (409, "This location is used by 1 task")
    assert empty.status_code == 204
    assert (await delete(office)).status_code == 409


async def test_errors_follow_the_language_of_the_interface(account):
    cleaner = await account("cleaner", "DE", PASSWORD)

    response = await call(
        auth.login,
        "POST",
        headers={"Accept-Language": "ru-RU,ru;q=0.9"},
        json_body={"email": cleaner.user.email, "password": "wrong"},
    )

    assert response.status_code == 401
    assert payload(response)["error"] == "Неверный email или пароль"
