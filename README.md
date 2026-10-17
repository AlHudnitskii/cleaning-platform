# Cleaning Platform

A platform for cleaning tasks across several countries. Administrators manage users and locations, managers assign and review the tasks of their country, and cleaners complete the tasks assigned to them, offline included.

## Architecture

```
cleaning-frontend/   React 19 + TypeScript + Vite, TanStack Query, react-router
cleaning-platform/   Python 3.11
  function_app.py    Azure Functions: HTTP API (/api/*)
  sse_server.py      aiohttp SSE server (/events/stream), reads events from RabbitMQ
  src/api/           HTTP handlers, request and response schemas (src/api/schemas, Pydantic), database queries
  src/domain/        enums, the current user and the rules: task access, status transitions, import, locations
  src/translations/  catalog of server messages in English and Russian
  src/infrastructure/ database (SQLAlchemy ORM), JWT, Blob, RabbitMQ, outbox, push
  src/scheduler/     background jobs: creates the tasks of recurring series a week ahead
  migrations/        Alembic
docker-compose.yml   Postgres 16 (ltree), RabbitMQ, Azurite; the app profile runs the whole app in containers
```

Event flow: a handler changes a task and writes an event to `outbox_messages` in **the same transaction** → `relay` publishes it to the `task_events` exchange → the push consumer sends Web Push, and the SSE server forwards the event to users who can see the task.

Recurring series: a task with a repeat rule starts a series. Every 10 minutes the scheduler creates the series' tasks for the next 7 days, each with the same title, location, assignee, priority, photo requirement and checklist, and a due date on its day. Cancelling the first task stops the series. Repeat rules run daily at most often.

### Roles and visibility

| Role | Sees tasks | Can |
|---|---|---|
| admin | all | everything, users and locations included |
| manager | of their country | create, import and export tasks of their country, change statuses, rate quality |
| cleaner | assigned to them | `pending → in_progress → on_review`, `in_progress ⇄ on_hold`, comments, photos |

Status transitions: `pending → in_progress → on_review → completed`; `on_review → in_progress` sends a task back for rework. A manager or an admin puts a task `on_hold`, cancels it or reopens it. The server returns `allowed_statuses` with each task for the current user, and the UI shows those statuses.

### Sessions

The browser keeps the access token (60 min) in memory and the refresh token in an httpOnly cookie (`Path=/api/auth`, `SameSite=Strict`). Deactivation, a password change and logout increment `users.token_version`, which revokes all tokens issued before at once.

## Running locally

You need Docker, Python 3.11, Node 22 and [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local).

```bash
cd cleaning-platform
python3.11 -m venv venv && venv/bin/pip install -r requirements-dev.txt
cp .env.example .env                      # set JWT_SECRET and JWT_REFRESH_SECRET (32+ characters)
cp local.settings.example.json local.settings.json   # the same values for func start
python generate_keys.py                   # VAPID keys for push, if you have none yet

cd ../cleaning-frontend && npm ci

cd .. && python3 start.py                 # infrastructure, migrations, API, SSE, consumer, relay, scheduler, frontend
```

Local environment security:
- Postgres, RabbitMQ and Azurite listen on `127.0.0.1`, and Postgres requires a password. A `postgres_data` volume created before this change keeps `trust` mode: recreate the volume (`docker compose down -v`, then `seed.py`) or replace `trust` with `scram-sha-256` in `pg_hba.conf` inside the container.
- `private_key.pem` (VAPID) stays out of git and out of the image; create it with `generate_keys.py`. `docker compose --profile app` passes the key as a secret. After a key change, users turn notifications on again.
- The app has no public sign-up: an administrator creates users on the Users page. Logout and deactivation delete the user's push subscriptions.

Test data: `cd cleaning-platform && venv/bin/python seed.py` clears the database and creates users such as `admin@cleaning.com / admin123`, `manager.de@cleaning.com / manager123` and `cleaner1@cleaning.com / cleaner123`.

Everything in containers: `JWT_SECRET=... JWT_REFRESH_SECRET=... docker compose --profile app up --build`.

| URL | |
|---|---|
| http://localhost:3000 | frontend (Vite proxies `/api` and `/events`) |
| http://localhost:7071/api/docs | Swagger UI (the spec comes from the Pydantic models) |
| http://localhost:15672 | RabbitMQ (guest/guest) |

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql+asyncpg://…` |
| `RABBITMQ_URL` | yes | `amqp://…` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | yes, 32+ characters | signing keys for access and refresh tokens (`openssl rand -hex 32`) |
| `AzureWebJobsStorage` | no | Blob connection string (Azurite by default) |
| `VAPID_PRIVATE_KEY`, `VAPID_CLAIMS_EMAIL` | no | Web Push |
| `SECURE_COOKIES` | no, `true` | `false` for local HTTP |
| `SSE_HOST`, `SSE_PORT` | no | SSE server address |
| `BLOB_PUBLIC_URL` | no | base of photo links in place of the storage address; set `/blob` locally, Vite proxies it to Azurite, and a phone on the same network can open photos |

Frontend: `VITE_API_BASE_URL` (default `/api`), `VITE_SSE_URL` (default `/events/stream`).

### From a phone

On the same Wi-Fi network, open the Mac's address: `http://<ip>:3000` (get it with `ipconfig getifaddr en0`). Tasks, photos and the language and theme switches work this way. Offline mode and push need HTTPS, because browsers allow service workers on HTTPS only.

For the full app, open a temporary HTTPS tunnel while `python3 start.py` runs. This one needs no install and works over SSH:

```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

It prints an `https://….lhr.life` address; open it on the phone, over mobile data too. If your network lets Cloudflare through, `cloudflared tunnel --url http://localhost:3000` also works (`brew install cloudflared`, address `https://….trycloudflare.com`). While the tunnel runs, anyone with the link can open the app; Ctrl+C stops it. On an iPhone, push arrives after you use "Add to Home Screen" (iOS 16.4+).

## Checks

```bash
cd cleaning-platform
ruff check . && ruff format --check . && mypy src sse_server.py function_app.py seed.py tests
pytest                                     # unit tests, offline
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@127.0.0.1:5432/empty_db pytest   # + integration tests (apply migrations to an empty database)

cd ../cleaning-frontend
npm run typecheck && npm run lint && npm test && npm run build
```

CI runs the same checks (`.github/workflows/ci.yml`).

### E2E

These scenarios run in a real browser against the real backend. A manager creates a task with a checklist and a required photo, a cleaner completes it and sends it for review, and the manager approves and rates it. Other scenarios cover role-based access, the saved language, and a WCAG 2.2 AA check (axe-core) of each page in the light and dark themes. You need `python3 start.py` running and the data from `seed.py`. Playwright starts its own frontend on port 3100 and uses the installed Google Chrome. The test deletes the task it created after the run.

```bash
cd cleaning-frontend
npm run e2e
```

Against another environment: `E2E_BASE_URL=http://localhost:3200 E2E_API_URL=http://127.0.0.1:7072/api npm run e2e`. Playwright then skips starting its own frontend.

## Migrations

```bash
cd cleaning-platform && venv/bin/alembic upgrade head
venv/bin/alembic revision --autogenerate -m "describe change"
```

Leave applied migrations as they are and change the schema with a new revision. Migration `810c321495ea` rebuilds the `ltree` paths from location IDs and clears the `nan` values an old import left behind; its `downgrade` does not restore the data.
