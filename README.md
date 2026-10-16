# Cleaning Platform

Платформа управления клининговыми задачами в нескольких странах: администраторы управляют пользователями и локациями, менеджеры ставят и проверяют задачи своей страны, уборщики выполняют назначенные задачи (в том числе офлайн).

## Архитектура

```
cleaning-frontend/   React 19 + TypeScript + Vite, TanStack Query, react-router
cleaning-platform/   Python 3.11
  function_app.py    Azure Functions: HTTP API (/api/*)
  sse_server.py      aiohttp SSE-сервер (/events/stream), события берёт из RabbitMQ
  src/api/           HTTP-обработчики (тонкие: разбор запроса → вызов → ответ)
  src/domain/        DTO (Pydantic) и правила: доступ к задачам, переходы статусов, импорт, локации
  src/infrastructure/ БД (SQLAlchemy ORM), JWT, Blob, RabbitMQ, outbox, push
  migrations/        Alembic
docker-compose.yml   Postgres 16 (ltree), RabbitMQ, Azurite; профиль app — всё приложение в контейнерах
```

Поток событий: обработчик меняет задачу и в **той же транзакции** пишет событие в `outbox_messages` → `relay` публикует его в exchange `task_events` → push-consumer шлёт Web Push, SSE-сервер рассылает событие только тем, кто видит задачу.

### Роли и видимость

| Роль | Видит задачи | Может |
|---|---|---|
| admin | все | всё, включая пользователей и локации |
| manager | своей страны | создавать/импортировать/экспортировать задачи своей страны, менять статусы, оценивать качество |
| cleaner | назначенные ему | `pending → in_progress → on_review`, `in_progress ⇄ on_hold`, комментарии, фото |

Переходы статусов: `pending → in_progress → on_review → completed`; `on_review → in_progress` (возврат на доработку); `on_hold`, `cancelled`, повторное открытие — только менеджер/админ. Сервер возвращает в каждой задаче `allowed_statuses` для текущего пользователя, UI показывает только их.

### Сессии

Access-токен (60 мин) хранится только в памяти браузера, refresh-токен — в httpOnly-cookie (`Path=/api/auth`, `SameSite=Strict`). Деактивация пользователя, смена пароля и выход увеличивают `users.token_version`, и все ранее выданные токены перестают действовать сразу.

## Локальный запуск

Нужны Docker, Python 3.11, Node 22 и [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local).

```bash
cd cleaning-platform
python3.11 -m venv venv && venv/bin/pip install -r requirements-dev.txt
cp .env.example .env                      # задайте JWT_SECRET и JWT_REFRESH_SECRET (≥ 32 символа)
cp local.settings.example.json local.settings.json   # те же значения для func start
python generate_keys.py                   # VAPID-ключи для push, если их ещё нет

cd ../cleaning-frontend && npm ci

cd .. && python3 start.py                 # инфраструктура, миграции, API, SSE, consumer, relay, фронтенд
```

Безопасность локального окружения:
- Postgres, RabbitMQ и Azurite слушают только `127.0.0.1`. Postgres требует пароль. Если том `postgres_data` создан до этого изменения, в нём остался режим `trust`: пересоздайте том (`docker compose down -v`, затем `seed.py`) или замените `trust` на `scram-sha-256` в `pg_hba.conf` внутри контейнера.
- `private_key.pem` (VAPID) не хранится в git и не попадает в образ: создайте его через `generate_keys.py`. В `docker compose --profile app` ключ передаётся как секрет. После смены ключа пользователи включают уведомления заново.
- Публичной регистрации нет: пользователей создаёт администратор на странице Users. Выход и деактивация удаляют push-подписки пользователя.

Тестовые данные: `cd cleaning-platform && venv/bin/python seed.py` (очищает БД и создаёт пользователей `admin@cleaning.com / admin123`, `manager.de@cleaning.com / manager123`, `cleaner1@cleaning.com / cleaner123` и др.).

Всё в контейнерах: `JWT_SECRET=... JWT_REFRESH_SECRET=... docker compose --profile app up --build`.

| URL | |
|---|---|
| http://localhost:3000 | фронтенд (Vite проксирует `/api` и `/events`) |
| http://localhost:7071/api/docs | Swagger UI (спецификация генерируется из Pydantic-моделей) |
| http://localhost:15672 | RabbitMQ (guest/guest) |

### Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---|---|
| `DATABASE_URL` | да | `postgresql+asyncpg://…` |
| `RABBITMQ_URL` | да | `amqp://…` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | да, ≥ 32 символа | подписи access/refresh-токенов (`openssl rand -hex 32`) |
| `AzureWebJobsStorage` | нет | строка подключения Blob (по умолчанию Azurite) |
| `VAPID_PRIVATE_KEY`, `VAPID_CLAIMS_EMAIL` | нет | Web Push |
| `SECURE_COOKIES` | нет, `true` | `false` только для локального HTTP |
| `SSE_HOST`, `SSE_PORT` | нет | адрес SSE-сервера |

Фронтенд: `VITE_API_BASE_URL` (по умолчанию `/api`), `VITE_SSE_URL` (по умолчанию `/events/stream`).

## Проверки

```bash
cd cleaning-platform
ruff check . && ruff format --check . && mypy src sse_server.py function_app.py seed.py tests
pytest                                     # юнит-тесты, офлайн
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@127.0.0.1:5432/empty_db pytest   # + интеграционные (накатывают миграции на пустую БД)

cd ../cleaning-frontend
npm run typecheck && npm run lint && npm test && npm run build
```

Те же проверки запускает CI (`.github/workflows/ci.yml`).

### E2E

Сценарии в реальном браузере против настоящего бэкенда: менеджер создаёт задачу с чек-листом и обязательным фото, уборщик выполняет её и отправляет на проверку, менеджер принимает и оценивает; плюс доступ по ролям, сохранение языка и проверка всех страниц на WCAG 2.2 AA (axe-core) в светлой и тёмной теме. Нужны запущенный `python3 start.py` и данные из `seed.py`; фронтенд на порту 3100 Playwright поднимает сам, браузер — установленный Google Chrome. Созданная тестом задача удаляется после прогона.

```bash
cd cleaning-frontend
npm run e2e
```

## Миграции

```bash
cd cleaning-platform && venv/bin/alembic upgrade head
venv/bin/alembic revision --autogenerate -m "describe change"
```

Применённые миграции не редактируются — изменения схемы только новой ревизией. Миграция `810c321495ea` пересобирает пути `ltree` из идентификаторов локаций и очищает значения `nan`, оставленные старым импортом; её `downgrade` данные не возвращает.
