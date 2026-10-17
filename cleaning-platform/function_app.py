import logging

import azure.functions as func

from src.api.auth import bp as auth_bp
from src.api.calendar import bp as calendar_bp
from src.api.checklist_templates import bp as checklist_templates_bp
from src.api.checklists import bp as checklists_bp
from src.api.docs import bp as docs_bp
from src.api.events import bp as events_bp
from src.api.export import bp as export_bp
from src.api.import_tasks import bp as import_bp
from src.api.locations import bp as locations_bp
from src.api.profile import bp as profile_bp
from src.api.push import bp as push_bp
from src.api.stats import bp as stats_bp
from src.api.sync import bp as sync_bp
from src.api.task_activity import bp as task_activity_bp
from src.api.tasks import bp as tasks_bp
from src.api.users import bp as users_bp
from src.settings import get_settings

logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(logging.WARNING)

get_settings()

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

for blueprint in (
    auth_bp,
    users_bp,
    profile_bp,
    tasks_bp,
    calendar_bp,
    task_activity_bp,
    checklists_bp,
    checklist_templates_bp,
    locations_bp,
    stats_bp,
    import_bp,
    export_bp,
    sync_bp,
    push_bp,
    docs_bp,
    events_bp,
):
    app.register_functions(blueprint)
