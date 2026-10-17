import azure.functions as func
import pytest
from azure.functions.decorators.function_app import Function

import function_app
from src.api.docs import ROUTES as DOCUMENTED

PUBLIC_ROUTES = {
    ("POST", "auth/login"),
    ("POST", "auth/refresh"),
    ("POST", "auth/logout"),
    ("GET", "push/vapid-public-key"),
    ("GET", "docs"),
    ("GET", "docs/openapi.json"),
}
DUMMY_ID = "00000000-0000-4000-8000-000000000000"


def http_routes() -> list[tuple[str, str, Function]]:
    routes: list[tuple[str, str, Function]] = []
    for function in function_app.app.get_functions():
        for binding in function.get_bindings():
            route = getattr(binding, "route", None)
            methods = getattr(binding, "methods", None)
            if route and methods:
                routes.extend((str(method.value), route, function) for method in methods)
    return routes


ROUTES = http_routes()


def test_public_routes_exist_and_registration_is_gone():
    routes = {(method, route) for method, route, _ in ROUTES}

    assert PUBLIC_ROUTES.issubset(routes)
    assert ("POST", "auth/register") not in routes


@pytest.mark.parametrize(
    ("method", "route", "function"),
    [entry for entry in ROUTES if (entry[0], entry[1]) not in PUBLIC_ROUTES],
    ids=lambda value: value if isinstance(value, str) else "",
)
async def test_every_other_route_requires_authentication(method, route, function):
    params = {name.strip("{}"): DUMMY_ID for name in route.split("/") if name.startswith("{")}
    request = func.HttpRequest(method=method, url=f"http://localhost/api/{route}", body=b"", route_params=params)

    response = await function.get_user_function()(request)

    assert response.status_code == 401, f"{method} {route} answered {response.status_code} without a token"


def test_every_route_is_described_in_the_api_documentation():
    documented = {(method.upper(), path.lstrip("/")) for method, path, *_ in DOCUMENTED}
    served = {(method, route) for method, route, _ in ROUTES if not route.startswith("docs")}

    assert served - documented == set(), "routes missing from docs.py"
    assert documented - served == set(), "docs.py describes routes that do not exist"
