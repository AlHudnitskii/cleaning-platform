import logging
import uuid

import azure.functions as func
from azure.core.exceptions import AzureError

from src.api.accounts import user_response
from src.api.http import ApiError, authenticated, json_response, read_model
from src.api.schemas.user import ProfileUpdate
from src.domain.models.user import CurrentUser
from src.domain.services.photos import detect_image_type
from src.infrastructure.blob.storage import AVATARS_CONTAINER, delete_blob, upload_blob
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import User
from src.translations import phrases

bp = func.Blueprint()
logger = logging.getLogger(__name__)

MAX_AVATAR_BYTES = 5 * 1024 * 1024


async def forget_blob(url: str | None) -> None:
    if not url:
        return
    try:
        await delete_blob(url)
    except AzureError:
        logger.exception("Failed to delete a replaced profile photo")


@bp.route(route="profile", methods=["PATCH"])
@authenticated()
async def update_profile(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    data = read_model(req, ProfileUpdate)
    if not data.model_fields_set:
        raise ApiError(400, phrases.NOTHING_TO_UPDATE())

    async with session_scope() as session, session.begin():
        record = await session.get(User, user.id, with_for_update=True)
        if record is None:
            raise ApiError(401, phrases.SESSION_INVALID())
        if "full_name" in data.model_fields_set:
            record.full_name = data.full_name
        if "phone" in data.model_fields_set:
            record.phone = data.phone

    return json_response(user_response(record))


@bp.route(route="profile/avatar", methods=["POST"])
@authenticated()
async def upload_avatar(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    photo = req.files.get("photo")
    if photo is None:
        raise ApiError(400, phrases.NO_PHOTO())
    data = photo.read(MAX_AVATAR_BYTES + 1)
    if len(data) > MAX_AVATAR_BYTES:
        raise ApiError(413, phrases.AVATAR_TOO_LARGE(megabytes=MAX_AVATAR_BYTES // (1024 * 1024)))
    image_type = detect_image_type(data)
    if image_type is None:
        raise ApiError(415, phrases.PHOTO_TYPE())

    url = await upload_blob(
        AVATARS_CONTAINER, f"{user.id}/{uuid.uuid4().hex}.{image_type.extension}", data, image_type.content_type
    )
    async with session_scope() as session, session.begin():
        record = await session.get(User, user.id, with_for_update=True)
        if record is None:
            raise ApiError(401, phrases.SESSION_INVALID())
        previous, record.avatar_url = record.avatar_url, url

    await forget_blob(previous)
    return json_response(user_response(record))


@bp.route(route="profile/avatar", methods=["DELETE"])
@authenticated()
async def delete_avatar(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    async with session_scope() as session, session.begin():
        record = await session.get(User, user.id, with_for_update=True)
        if record is None:
            raise ApiError(401, phrases.SESSION_INVALID())
        previous, record.avatar_url = record.avatar_url, None

    await forget_blob(previous)
    return json_response(user_response(record))
