import azure.functions as func
from src.api.tasks import bp as tasks_bp
from src.api.locations import bp as locations_bp
from src.api.auth import bp as auth_bp
from src.api.export import bp as export_bp
from src.api.docs import bp as docs_bp

app = func.FunctionApp()

app.register_functions(tasks_bp)
app.register_functions(locations_bp)
app.register_functions(auth_bp)
app.register_functions(export_bp)
app.register_functions(docs_bp)
