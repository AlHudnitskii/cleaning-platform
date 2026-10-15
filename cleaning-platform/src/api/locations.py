import uuid

import azure.functions as func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.http import ApiError, authenticated, json_response, not_found, query_choice, read_model, route_uuid
from src.domain.models.enums import Country, LocationLevel, UserRole
from src.domain.models.location import LocationCreate, LocationResponse
from src.domain.models.user import CurrentUser
from src.domain.services.locations import FULL_NAME_SEPARATOR, LocationNode, build_path, child_error, full_names
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Location

bp = func.Blueprint()


def visible_country(user: CurrentUser, requested: Country | None) -> str | None:
    if user.is_admin:
        return requested
    return user.country


def to_response(location: Location, names: dict[uuid.UUID, list[str]]) -> LocationResponse:
    return LocationResponse(
        id=location.id,
        name=location.name,
        country=Country(location.country),
        level=LocationLevel(location.level),
        parent_id=location.parent_id,
        path=str(location.path),
        full_name=FULL_NAME_SEPARATOR.join(names.get(location.id, [location.name])),
        created_at=location.created_at,
    )


async def fetch_locations(session: AsyncSession, country: str | None) -> list[Location]:
    stmt = select(Location).order_by(Location.path)
    if country:
        stmt = stmt.where(Location.country == country)
    return list((await session.scalars(stmt)).all())


def name_index(locations: list[Location]) -> dict[uuid.UUID, list[str]]:
    return full_names(LocationNode(id=loc.id, parent_id=loc.parent_id, name=loc.name) for loc in locations)


@bp.route(route="locations", methods=["POST"])
@authenticated(UserRole.ADMIN)
async def create_location(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    data = read_model(req, LocationCreate)
    location_id = uuid.uuid4()

    async with session_scope() as session, session.begin():
        parent_path = None
        if data.parent_id:
            parent = await session.get(Location, data.parent_id)
            if parent is None:
                raise not_found("Parent location")
            error = child_error(LocationLevel(parent.level), parent.country, data.level, data.country)
            if error:
                raise ApiError(400, error)
            parent_path = str(parent.path)

        location = Location(
            id=location_id,
            name=data.name,
            country=data.country,
            path=build_path(parent_path, location_id),
            level=data.level,
            parent_id=data.parent_id,
        )
        session.add(location)
        await session.flush()
        await session.refresh(location)
        locations = await fetch_locations(session, data.country)

    return json_response(to_response(location, name_index(locations)), 201)


@bp.route(route="locations", methods=["GET"])
@authenticated()
async def get_locations(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    country = visible_country(user, query_choice(req, "country", Country))
    async with session_scope() as session:
        locations = await fetch_locations(session, country)
    names = name_index(locations)
    return json_response([to_response(loc, names) for loc in locations])


@bp.route(route="locations/{location_id}/children", methods=["GET"])
@authenticated()
async def get_children(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    location_id = route_uuid(req, "location_id", "location ID")
    country = visible_country(user, None)

    async with session_scope() as session:
        location = await session.get(Location, location_id)
        if location is None or (country and location.country != country):
            raise not_found("Location")
        locations = await fetch_locations(session, location.country)

    names = name_index(locations)
    root = str(location.path)
    descendants = [loc for loc in locations if str(loc.path).startswith(root + ".")]
    return json_response([to_response(loc, names) for loc in descendants])
