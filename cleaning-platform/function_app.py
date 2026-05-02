import azure.functions as func
from src.api.tasks import bp as tasks_bp
from src.api.locations import bp as locations_bp
from src.api.auth import bp as auth_bp
from src.api.export import bp as export_bp
from src.api.docs import bp as docs_bp
from src.api.stats import bp as stats_bp
from src.api.push import bp as push_bp
from src.api.events import bp as events_bp
from src.api.users import bp as users_bp
from src.api.reports import bp as reports_bp
from src.api.sync import bp as sync_bp
from src.api.import_tasks import bp as import_bp

app = func.FunctionApp()

app.register_functions(tasks_bp)
app.register_functions(locations_bp)
app.register_functions(auth_bp)
app.register_functions(export_bp)
app.register_functions(docs_bp)
app.register_functions(stats_bp)
app.register_functions(push_bp)
app.register_functions(events_bp)
app.register_functions(users_bp)
app.register_functions(reports_bp)
app.register_functions(sync_bp)
app.register_functions(import_bp)
