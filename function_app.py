import azure.functions as func
from src.api.tasks import bp as tasks_bp
from src.api.locations import bp as locations_bp

app = func.FunctionApp()

app.register_functions(tasks_bp)
app.register_functions(locations_bp)
