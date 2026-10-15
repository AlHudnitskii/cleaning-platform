import azure.functions as func
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert

from src.api.http import authenticated, json_response, public, read_model
from src.domain.models.user import CurrentUser
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import PushSubscription
from src.infrastructure.push.notifications import get_public_key_base64

bp = func.Blueprint()


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=500)
    auth: str = Field(min_length=1, max_length=100)


class SubscriptionCreate(BaseModel):
    endpoint: str = Field(min_length=1, max_length=500, pattern=r"^https://")
    keys: SubscriptionKeys


@bp.route(route="push/vapid-public-key", methods=["GET"])
@public
async def get_vapid_key(req: func.HttpRequest) -> func.HttpResponse:
    return json_response({"public_key": get_public_key_base64()})


@bp.route(route="push/subscribe", methods=["POST"])
@authenticated()
async def subscribe(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    data = read_model(req, SubscriptionCreate)

    stmt = insert(PushSubscription).values(
        user_id=user.id,
        endpoint=data.endpoint,
        p256dh=data.keys.p256dh,
        auth=data.keys.auth,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[PushSubscription.endpoint],
        set_={"user_id": user.id, "p256dh": data.keys.p256dh, "auth": data.keys.auth},
    )
    async with session_scope() as session, session.begin():
        await session.execute(stmt)

    return json_response({"message": "Subscribed successfully"}, 201)


@bp.route(route="push/unsubscribe", methods=["DELETE"])
@authenticated()
async def unsubscribe(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    async with session_scope() as session, session.begin():
        await session.execute(delete(PushSubscription).where(PushSubscription.user_id == user.id))
    return json_response({"message": "Unsubscribed"})
