from typing import Any

import pytest

from src.api import checklist_templates as templates
from tests.integration.conftest import Account, call, payload

pytestmark = pytest.mark.integration


async def create(account: Account, **fields: Any):
    body = {"name": "Bathroom", "items": ["Clean the sink", "Mop the floor"], **fields}
    return await call(templates.create_template, "POST", headers=account.headers, json_body=body)


async def listed(account: Account, params: dict[str, str] | None = None) -> list[dict[str, Any]]:
    response = await call(templates.list_templates, headers=account.headers, params=params)
    assert response.status_code == 200
    result: list[dict[str, Any]] = payload(response)
    return result


async def test_a_manager_creates_a_template_in_their_country(account):
    manager = await account("manager", "DE")

    response = await create(manager, items=["  Clean the sink ", "Mop the floor"], country=None)

    body = payload(response)
    assert response.status_code == 201
    assert (body["name"], body["country"], body["items"]) == ("Bathroom", "DE", ["Clean the sink", "Mop the floor"])
    assert [template["name"] for template in await listed(manager)] == ["Bathroom"]


async def test_managers_see_only_their_country_and_admins_filter_by_country(account):
    german, dutch, admin = await account("manager", "DE"), await account("manager", "NL"), await account("admin", None)
    await create(german, name="Office")
    await create(dutch, name="Kitchen")

    assert [t["name"] for t in await listed(german)] == ["Office"]
    assert [t["name"] for t in await listed(admin)] == ["Kitchen", "Office"]
    assert [t["name"] for t in await listed(admin, {"country": "NL"})] == ["Kitchen"]


async def test_a_manager_cannot_create_a_template_for_another_country(account):
    manager = await account("manager", "DE")

    response = await create(manager, country="NL")

    assert response.status_code == 403


async def test_an_admin_names_the_country_of_a_template(account):
    admin = await account("admin", None)

    missing = await create(admin)
    given = await create(admin, country="NL")

    assert (missing.status_code, given.status_code) == (400, 201)


@pytest.mark.parametrize(
    "fields",
    [{"items": []}, {"items": [" "]}, {"name": "A"}, {"items": ["x" * 256]}, {"items": ["Step"] * 51}],
    ids=["no steps", "blank step", "short name", "long step", "too many steps"],
)
async def test_invalid_templates_are_rejected(account, fields):
    manager = await account("manager", "DE")

    response = await create(manager, **fields)

    assert response.status_code == 400


async def test_names_are_unique_within_a_country(account):
    german, dutch = await account("manager", "DE"), await account("manager", "NL")
    await create(german)

    again = await create(german)
    elsewhere = await create(dutch)

    assert (again.status_code, elsewhere.status_code) == (409, 201)


async def test_a_manager_edits_and_deletes_a_template(account):
    manager = await account("manager", "DE")
    template_id = payload(await create(manager))["id"]

    edited = await call(
        templates.update_template,
        "PATCH",
        headers=manager.headers,
        route={"template_id": template_id},
        json_body={"name": "Bathroom, full", "items": ["Clean the sink"]},
    )
    deleted = await call(
        templates.delete_template, "DELETE", headers=manager.headers, route={"template_id": template_id}
    )

    assert (payload(edited)["name"], payload(edited)["items"]) == ("Bathroom, full", ["Clean the sink"])
    assert deleted.status_code == 204
    assert await listed(manager) == []


async def test_renaming_onto_a_taken_name_is_a_conflict(account):
    manager = await account("manager", "DE")
    await create(manager, name="Office")
    template_id = payload(await create(manager, name="Kitchen"))["id"]

    response = await call(
        templates.update_template,
        "PATCH",
        headers=manager.headers,
        route={"template_id": template_id},
        json_body={"name": "Office"},
    )

    assert response.status_code == 409


async def test_a_template_of_another_country_looks_missing(account):
    german, dutch = await account("manager", "DE"), await account("manager", "NL")
    template_id = payload(await create(dutch))["id"]

    edited = await call(
        templates.update_template,
        "PATCH",
        headers=german.headers,
        route={"template_id": template_id},
        json_body={"name": "Mine"},
    )
    deleted = await call(
        templates.delete_template, "DELETE", headers=german.headers, route={"template_id": template_id}
    )

    assert (edited.status_code, deleted.status_code) == (404, 404)


async def test_cleaners_have_no_access_to_templates(account):
    cleaner = await account("cleaner", "DE")

    listing = await call(templates.list_templates, headers=cleaner.headers)
    creating = await create(cleaner)

    assert (listing.status_code, creating.status_code) == (403, 403)
