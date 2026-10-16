import azure.functions as func

from src.api.http import authenticated, json_response, not_found
from src.domain.models.user import CurrentUser
from src.infrastructure.auth.jwt_handler import STREAM_TICKET_LIFETIME, create_stream_ticket
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import User
from src.translations import phrases

bp = func.Blueprint()


@bp.route(route="events/ticket", methods=["POST"])
@authenticated()
async def stream_ticket(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    async with session_scope() as session:
        record = await session.get(User, user.id)
    if record is None:
        raise not_found(phrases.USER)
    ticket = create_stream_ticket(record.id, record.token_version)
    return json_response({"ticket": ticket, "expires_in": int(STREAM_TICKET_LIFETIME.total_seconds())}, 201)
