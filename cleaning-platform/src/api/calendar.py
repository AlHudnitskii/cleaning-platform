from datetime import date

import azure.functions as func

from src.api.http import ApiError, authenticated, json_response, optional_uuid, parse_date, query_choice
from src.api.schemas.task import CalendarResponse, CalendarTask
from src.api.task_queries import scope_conditions, task_rows
from src.domain.models.enums import Country, TaskPriority, TaskStatus
from src.domain.models.user import CurrentUser
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Task
from src.translations import phrases

bp = func.Blueprint()

# Six weeks cover a month grid with its leading and trailing days.
MAX_CALENDAR_DAYS = 42
MAX_CALENDAR_TASKS = 500


def calendar_period(req: func.HttpRequest) -> tuple[date, date]:
    raw_from, raw_to = req.params.get("date_from"), req.params.get("date_to")
    if not raw_from or not raw_to:
        raise ApiError(400, phrases.PERIOD_REQUIRED())
    date_from, date_to = parse_date(raw_from, "date_from"), parse_date(raw_to, "date_to")
    if date_from > date_to:
        raise ApiError(400, phrases.PERIOD_REVERSED())
    if (date_to - date_from).days >= MAX_CALENDAR_DAYS:
        raise ApiError(400, phrases.CALENDAR_PERIOD_TOO_LONG(days=MAX_CALENDAR_DAYS))
    return date_from, date_to


@bp.route(route="calendar/tasks", methods=["GET"])
@authenticated()
async def get_calendar(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    date_from, date_to = calendar_period(req)
    assignee = optional_uuid(req, "assigned_to")
    country = query_choice(req, "country", Country)

    conditions = [*scope_conditions(user), Task.due_date >= date_from, Task.due_date <= date_to]
    if assignee:
        conditions.append(Task.assigned_to == assignee)
    if country and user.is_admin:
        conditions.append(Task.country == country)

    async with session_scope() as session:
        rows = (
            await session.execute(
                task_rows()
                .where(*conditions)
                .order_by(Task.due_date, Task.created_at, Task.id)
                .limit(MAX_CALENDAR_TASKS + 1)
            )
        ).all()

    tasks = [
        CalendarTask(
            id=task.id,
            title=task.title,
            status=TaskStatus(task.status),
            priority=TaskPriority(task.priority),
            country=Country(task.country),
            due_date=task.due_date,
            assigned_to=task.assigned_to,
            assigned_to_email=email,
            assigned_to_name=name,
            location_name=location_name,
            is_recurring=task.is_recurring,
            parent_task_id=task.parent_task_id,
        )
        for task, email, location_name, name in rows[:MAX_CALENDAR_TASKS]
        # The query filters by due date, so this only narrows the type.
        if task.due_date is not None
    ]
    body = CalendarResponse(date_from=date_from, date_to=date_to, data=tasks, truncated=len(rows) > MAX_CALENDAR_TASKS)
    return json_response(body)
