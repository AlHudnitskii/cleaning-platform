import uuid
from datetime import UTC, datetime

import azure.functions as func
from sqlalchemy import select

from src.api.http import ApiError, authenticated, json_response, read_model, route_uuid
from src.api.task_store import load_visible_task
from src.domain.models.enums import TaskStatus
from src.domain.models.task import CommentCreate, CommentResponse, HistoryEntryResponse, PhotoResponse
from src.domain.models.user import CurrentUser
from src.domain.services.photos import MAX_PHOTO_BYTES, detect_image_type, display_filename
from src.infrastructure.blob.storage import PHOTOS_CONTAINER, read_link, upload_blob
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import TaskComment, TaskPhoto, TaskStatusHistory, User
from src.translations import phrases

bp = func.Blueprint()


def photo_response(photo: TaskPhoto) -> PhotoResponse:
    response = PhotoResponse.model_validate(photo)
    return response.model_copy(update={"url": read_link(photo.url)})


def comment_response(comment: TaskComment, author: User) -> CommentResponse:
    return CommentResponse(
        id=comment.id,
        task_id=comment.task_id,
        user_id=comment.user_id,
        user_email=author.email,
        user_role=author.role,
        text=comment.text,
        created_at=comment.created_at,
    )


@bp.route(route="tasks/{task_id}/comments", methods=["GET"])
@authenticated()
async def get_comments(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    async with session_scope() as session:
        await load_visible_task(session, user, task_id)
        rows = (
            await session.execute(
                select(TaskComment, User)
                .join(User, TaskComment.user_id == User.id)
                .where(TaskComment.task_id == task_id)
                .order_by(TaskComment.created_at, TaskComment.id)
            )
        ).all()
    return json_response([comment_response(comment, author) for comment, author in rows])


@bp.route(route="tasks/{task_id}/comments", methods=["POST"])
@authenticated()
async def add_comment(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    data = read_model(req, CommentCreate)

    async with session_scope() as session, session.begin():
        await load_visible_task(session, user, task_id)
        comment = TaskComment(task_id=task_id, user_id=user.id, text=data.text, created_at=datetime.now(UTC))
        session.add(comment)
        await session.flush()
        response = CommentResponse(
            id=comment.id,
            task_id=task_id,
            user_id=user.id,
            user_email=user.email,
            user_role=user.role,
            text=comment.text,
            created_at=comment.created_at,
        )

    return json_response(response, 201)


@bp.route(route="tasks/{task_id}/history", methods=["GET"])
@authenticated()
async def get_task_history(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    async with session_scope() as session:
        await load_visible_task(session, user, task_id)
        rows = (
            await session.execute(
                select(TaskStatusHistory, User.email)
                .outerjoin(User, TaskStatusHistory.changed_by == User.id)
                .where(TaskStatusHistory.task_id == task_id)
                .order_by(TaskStatusHistory.changed_at, TaskStatusHistory.id)
            )
        ).all()

    return json_response(
        [
            HistoryEntryResponse(
                id=entry.id,
                task_id=entry.task_id,
                old_status=TaskStatus(entry.old_status) if entry.old_status else None,
                new_status=TaskStatus(entry.new_status),
                changed_by=entry.changed_by,
                changed_by_email=email,
                changed_at=entry.changed_at,
            )
            for entry, email in rows
        ]
    )


@bp.route(route="tasks/{task_id}/photos", methods=["GET"])
@authenticated()
async def get_task_photos(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    async with session_scope() as session:
        await load_visible_task(session, user, task_id)
        photos = (
            await session.scalars(
                select(TaskPhoto)
                .where(TaskPhoto.task_id == task_id)
                .order_by(TaskPhoto.uploaded_at.desc(), TaskPhoto.id.desc())
            )
        ).all()
    return json_response([photo_response(photo) for photo in photos])


@bp.route(route="tasks/{task_id}/photos", methods=["POST"])
@authenticated()
async def upload_task_photo(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")

    async with session_scope() as session:
        await load_visible_task(session, user, task_id)

    photo = req.files.get("photo")
    if photo is None:
        raise ApiError(400, phrases.NO_PHOTO())

    data = photo.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise ApiError(413, phrases.PHOTO_TOO_LARGE(megabytes=MAX_PHOTO_BYTES // (1024 * 1024)))
    image_type = detect_image_type(data)
    if image_type is None:
        raise ApiError(415, phrases.PHOTO_TYPE())

    photo_id = uuid.uuid4()
    url = await upload_blob(
        PHOTOS_CONTAINER,
        f"{task_id}/{photo_id.hex}.{image_type.extension}",
        data,
        image_type.content_type,
    )

    async with session_scope() as session, session.begin():
        record = TaskPhoto(
            id=photo_id,
            task_id=task_id,
            url=url,
            filename=display_filename(photo.filename, image_type),
            uploaded_at=datetime.now(UTC),
        )
        session.add(record)

    return json_response(photo_response(record), 201)
