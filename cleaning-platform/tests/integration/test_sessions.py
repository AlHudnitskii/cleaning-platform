import azure.functions as func
import pytest

from src.api import auth, tasks, users
from tests.integration.conftest import call, payload

pytestmark = pytest.mark.integration

PASSWORD = "secret123"


def refresh_cookie(response: func.HttpResponse) -> str:
    header = str(response.headers.get("Set-Cookie", ""))
    assert "HttpOnly" in header
    name_value = header.split(";", 1)[0]
    assert name_value.startswith("refresh_token=")
    return name_value


async def login(email: str, password: str = PASSWORD):
    return await call(auth.login, "POST", json_body={"email": email, "password": password})


async def test_login_sets_refresh_cookie_and_hides_token_from_body(account):
    cleaner = await account("cleaner", "DE", PASSWORD)

    response = await login(cleaner.user.email)

    assert response.status_code == 200
    body = payload(response)
    assert "refresh_token" not in body
    assert body["user"]["email"] == cleaner.user.email
    refresh_cookie(response)


async def test_login_with_wrong_password_is_rejected(account):
    cleaner = await account("cleaner", "DE", PASSWORD)

    response = await login(cleaner.user.email, "wrong-password")

    assert response.status_code == 401


async def test_refresh_uses_cookie_and_rotates(account):
    cleaner = await account("cleaner", "DE", PASSWORD)
    cookie = refresh_cookie(await login(cleaner.user.email))

    response = await call(auth.refresh, "POST", headers={"Cookie": cookie})

    assert response.status_code == 200
    assert payload(response)["access_token"]
    refresh_cookie(response)


async def test_refresh_without_cookie_is_rejected():
    response = await call(auth.refresh, "POST")

    assert response.status_code == 401


async def test_logout_revokes_refresh_and_access_tokens(account):
    cleaner = await account("cleaner", "DE", PASSWORD)
    logged_in = await login(cleaner.user.email)
    cookie = refresh_cookie(logged_in)
    access = {"Authorization": f"Bearer {payload(logged_in)['access_token']}"}

    logout = await call(auth.logout, "POST", headers={"Cookie": cookie})

    assert logout.status_code == 204
    assert "Max-Age=0" in logout.headers.get("Set-Cookie", "")
    assert (await call(auth.refresh, "POST", headers={"Cookie": cookie})).status_code == 401
    assert (await call(auth.me, headers=access)).status_code == 401


async def test_deactivated_user_loses_access_immediately(account):
    admin = await account("admin", None)
    cleaner = await account("cleaner", "DE")
    assert (await call(tasks.get_tasks, headers=cleaner.headers)).status_code == 200

    toggled = await call(users.toggle_active, "PATCH", headers=admin.headers, route={"user_id": str(cleaner.user.id)})

    assert toggled.status_code == 200
    assert payload(toggled)["is_active"] is False
    assert (await call(tasks.get_tasks, headers=cleaner.headers)).status_code == 401


async def test_password_change_revokes_previous_tokens(account):
    cleaner = await account("cleaner", "DE", PASSWORD)

    response = await call(
        users.change_password,
        "PATCH",
        headers=cleaner.headers,
        json_body={"old_password": PASSWORD, "new_password": "new-secret-456"},
    )

    assert response.status_code == 200
    new_access = {"Authorization": f"Bearer {payload(response)['access_token']}"}
    assert (await call(auth.me, headers=cleaner.headers)).status_code == 401
    assert (await call(auth.me, headers=new_access)).status_code == 200
    assert (await login(cleaner.user.email, "new-secret-456")).status_code == 200


async def test_cleaner_cannot_list_users(account):
    cleaner = await account("cleaner", "DE")

    response = await call(users.get_users, headers=cleaner.headers)

    assert response.status_code == 403
