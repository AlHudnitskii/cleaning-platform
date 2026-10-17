import uuid

import azure.functions as func
from sqlalchemy import func as sql
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.http import (
    ApiError,
    authenticated,
    forbidden,
    json_response,
    not_found,
    query_choice,
    read_model,
    route_uuid,
)
from src.api.schemas.checklist_template import (
    ChecklistTemplateCreate,
    ChecklistTemplateResponse,
    ChecklistTemplateUpdate,
)
from src.domain.models.enums import Country, UserRole
from src.domain.models.user import CurrentUser
from src.domain.services import task_access
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import ChecklistTemplate
from src.translations import phrases

bp = func.Blueprint()

MAX_TEMPLATES_PER_COUNTRY = 100


def to_response(template: ChecklistTemplate) -> ChecklistTemplateResponse:
    return ChecklistTemplateResponse(
        id=template.id,
        name=template.name,
        country=Country(template.country),
        items=list(template.items),
        created_at=template.created_at,
    )


async def load_template(session: AsyncSession, user: CurrentUser, template_id: uuid.UUID) -> ChecklistTemplate:
    template = await session.get(ChecklistTemplate, template_id, with_for_update=True)
    # A template of another country answers like a missing one, so IDs reveal nothing.
    if template is None or not task_access.can_manage_country(user, template.country):
        raise not_found(phrases.CHECKLIST_TEMPLATE)
    return template


async def save(session: AsyncSession) -> None:
    try:
        await session.flush()
    except IntegrityError as e:
        raise ApiError(409, phrases.TEMPLATE_NAME_TAKEN()) from e


@bp.route(route="checklist-templates", methods=["GET"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def list_templates(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    country = user.country if user.is_manager else query_choice(req, "country", Country)
    stmt = select(ChecklistTemplate).order_by(sql.lower(ChecklistTemplate.name), ChecklistTemplate.id)
    if country:
        stmt = stmt.where(ChecklistTemplate.country == country)
    async with session_scope() as session:
        templates = (await session.scalars(stmt)).all()
    return json_response([to_response(template) for template in templates])


@bp.route(route="checklist-templates", methods=["POST"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def create_template(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    data = read_model(req, ChecklistTemplateCreate)
    country = data.country or user.country
    if country is None:
        raise ApiError(400, phrases.TEMPLATE_COUNTRY_REQUIRED())
    if not task_access.can_manage_country(user, country):
        raise forbidden(phrases.TEMPLATE_IN_OWN_COUNTRY())

    async with session_scope() as session, session.begin():
        count = await session.scalar(
            select(sql.count()).select_from(ChecklistTemplate).where(ChecklistTemplate.country == country)
        )
        if (count or 0) >= MAX_TEMPLATES_PER_COUNTRY:
            raise ApiError(400, phrases.TEMPLATES_TOO_MANY(limit=MAX_TEMPLATES_PER_COUNTRY))
        template = ChecklistTemplate(name=data.name, country=country, items=data.items)
        session.add(template)
        await save(session)
        response = to_response(template)

    return json_response(response, 201)


@bp.route(route="checklist-templates/{template_id}", methods=["PATCH"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def update_template(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    template_id = route_uuid(req, "template_id", "template ID")
    data = read_model(req, ChecklistTemplateUpdate)
    if not data.model_fields_set:
        raise ApiError(400, phrases.NOTHING_TO_UPDATE())

    async with session_scope() as session, session.begin():
        template = await load_template(session, user, template_id)
        if data.name is not None:
            template.name = data.name
        if data.items is not None:
            template.items = data.items
        await save(session)
        response = to_response(template)

    return json_response(response)


@bp.route(route="checklist-templates/{template_id}", methods=["DELETE"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def delete_template(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    template_id = route_uuid(req, "template_id", "template ID")
    async with session_scope() as session, session.begin():
        template = await load_template(session, user, template_id)
        await session.delete(template)
    return func.HttpResponse(status_code=204)
