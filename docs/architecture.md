# Архитектура

Платформа управляет задачами по уборке в нескольких странах: менеджеры создают и проверяют задачи, уборщики выполняют их с телефона, в том числе без связи.

## Роли

| Роль | Видит | Может |
|---|---|---|
| Администратор | все страны | всё, включая пользователей, локации и пароли |
| Менеджер | задачи и локации своей страны | создавать, назначать, принимать и оценивать задачи своей страны, импорт и экспорт |
| Уборщик | только назначенные ему задачи | брать в работу, отмечать чек-лист, загружать фото, отправлять на проверку |

Права проверяются на сервере в каждом запросе (`src/domain/services/task_access.py`); интерфейс только скрывает недоступные действия.

## Контекст

```mermaid
flowchart LR
    manager([Менеджер / администратор<br/>браузер на компьютере])
    cleaner([Уборщик<br/>PWA на телефоне])
    platform[[Cleaning Platform]]
    push[(Push-сервисы браузеров<br/>FCM, Apple, Mozilla)]

    manager -- "HTTPS: задачи, отчёты, импорт" --> platform
    cleaner -- "HTTPS: свои задачи, фото, офлайн-синхронизация" --> platform
    platform -- "Web Push (VAPID)" --> push
    push -- "уведомления" --> cleaner
    push -- "уведомления" --> manager
```

## Контейнеры

```mermaid
flowchart TB
    subgraph browser[Браузер]
        spa[SPA: React 19 + TypeScript<br/>TanStack Query, react-router]
        sw[Service worker<br/>кеш, офлайн-ответы, push]
    end

    subgraph backend[Бэкенд, Python 3.11]
        api[HTTP API<br/>Azure Functions v2, blueprints]
        relay[Outbox relay]
        consumer[Push consumer]
        sse[SSE-сервер<br/>aiohttp]
    end

    db[(PostgreSQL 16<br/>ltree)]
    mq[[RabbitMQ<br/>fanout task_events]]
    blob[(Azure Blob Storage<br/>фото, выгрузки)]

    spa -- "/api, JSON + JWT" --> api
    spa -- "/events/stream?ticket=…, SSE" --> sse
    spa -. "фото по SAS-ссылке" .-> blob
    sw --- spa

    api -- "SQLAlchemy async" --> db
    api -- "загрузка, SAS" --> blob
    relay -- "читает outbox" --> db
    relay -- "publish, confirms" --> mq
    mq -- "очередь push" --> consumer
    mq -- "эксклюзивная очередь" --> sse
    consumer -- "подписки" --> db
```

| Контейнер | Ответственность | Код |
|---|---|---|
| HTTP API | REST-эндпоинты, авторизация, валидация, бизнес-правила, запись событий в outbox в той же транзакции | `function_app.py`, `src/api/` |
| Outbox relay | Пачками по 100 забирает неопубликованные события (`FOR UPDATE SKIP LOCKED`), публикует с подтверждением, отмечает `published_at` | `src/infrastructure/messaging/relay.py` |
| Push consumer | Из очереди решает, кого уведомить, рендерит текст на языке устройства, отправляет Web Push, удаляет протухшие подписки | `src/infrastructure/messaging/consumer.py` |
| SSE-сервер | Пускает по одноразовому билету на 30 секунд (`POST /events/ticket`), держит открытые соединения и рассылает события только тем, кто имеет право видеть задачу | `sse_server.py`, `src/api/events.py` |
| SPA | Интерфейс, кеш серверного состояния, URL как источник фильтров, офлайн-очередь уборщика | `cleaning-frontend/src/` |
| Service worker | Кеш оболочки приложения, офлайн-ответ API, показ push и открытие задачи по клику | `cleaning-frontend/public/sw.js` |

Слои бэкенда: `src/api` (транспорт и сценарии) → `src/domain` (модели, правила доступа, разбор импорта, локации, без зависимостей от инфраструктуры) ← `src/infrastructure` (БД, очередь, хранилище, push, JWT). Тексты на двух языках — `src/translations`.

## Данные

```mermaid
erDiagram
    users ||--o{ tasks : "назначена (assigned_to)"
    users ||--o{ task_comments : пишет
    users ||--o{ task_status_history : "меняет (changed_by)"
    users ||--o{ push_subscriptions : "устройства"
    locations ||--o{ locations : "вложена (parent_id)"
    locations ||--o{ tasks : "место (location_id)"
    tasks ||--o{ tasks : "повторение (parent_task_id)"
    tasks ||--o{ task_photos : фото
    tasks ||--o{ task_checklist_items : чек-лист
    tasks ||--o{ task_comments : комментарии
    tasks ||--o{ task_status_history : история

    users {
        uuid id PK
        string email UK
        string hashed_password "bcrypt"
        string role "admin | manager | cleaner"
        string country "NULL для администратора"
        bool is_active
        int token_version "инвалидирует все сессии"
    }
    locations {
        uuid id PK
        string name
        string country
        ltree path "GiST-индекс"
        string level "country > city > building > floor > room"
        uuid parent_id FK
    }
    tasks {
        uuid id PK
        string title
        string status "CHECK по перечню"
        string priority
        string country
        uuid location_id FK
        uuid assigned_to FK
        date due_date
        bool photo_required
        string rrule "RFC 5545"
        int quality_score "CHECK 1..5"
    }
    task_checklist_items {
        uuid id PK
        uuid task_id FK
        int position
        bool done
        uuid done_by FK
    }
    task_photos {
        uuid id PK
        uuid task_id FK
        string url "приватный blob"
    }
    task_status_history {
        uuid id PK
        uuid task_id FK
        string old_status
        string new_status
        uuid changed_by FK
    }
    push_subscriptions {
        uuid id PK
        uuid user_id FK
        string endpoint UK
        string locale "язык уведомлений"
    }
    outbox_messages {
        uuid id PK
        string event_type
        jsonb payload
        timestamptz published_at "частичный индекс по NULL"
    }
    login_failures {
        uuid id PK
        string email
        timestamptz failed_at
    }
```

Схема ведётся миграциями Alembic (`cleaning-platform/migrations/versions`), каждая с откатом. Инварианты закреплены в БД: уникальный email и endpoint, CHECK на статус, приоритет и оценку, каскадное удаление фото, чек-листа, комментариев и истории вместе с задачей.

## Ключевые потоки

### Смена статуса и уведомления

```mermaid
sequenceDiagram
    autonumber
    participant C as Уборщик (SPA)
    participant API as HTTP API
    participant DB as PostgreSQL
    participant R as Outbox relay
    participant MQ as RabbitMQ
    participant P as Push consumer
    participant S as SSE-сервер
    participant M as Менеджер (SPA)

    C->>API: PATCH /tasks/{id}/status {on_review}
    API->>API: права, переход, блокеры (чек-лист, фото)
    API->>DB: UPDATE tasks + INSERT history + INSERT outbox (одна транзакция)
    API-->>C: 200 TaskResponse
    R->>DB: SELECT … FOR UPDATE SKIP LOCKED
    R->>MQ: publish task_status_changed (confirm)
    R->>DB: published_at = now()
    MQ->>S: событие
    S->>M: SSE, если менеджер видит задачу
    M->>API: перезапрос списка и счётчиков
    MQ->>P: событие
    P->>DB: подписки исполнителя
    P-->>C: Web Push на языке устройства
```

Событие записывается в той же транзакции, что и изменение, поэтому падение очереди не теряет уведомления, а откат транзакции не рассылает несуществующих изменений (подробнее — ADR-001).

### Вход и сессия

```mermaid
sequenceDiagram
    autonumber
    participant B as Браузер
    participant API as HTTP API
    participant DB as PostgreSQL

    B->>API: POST /auth/login {email, password}
    API->>DB: неудачные попытки за 15 минут
    alt 5 и больше
        API-->>B: 429 + Retry-After
    else
        API->>API: bcrypt.checkpw
        API-->>B: access token (60 мин, в теле) + refresh token (30 дней, HttpOnly, SameSite=Strict, Path=/api/auth)
    end
    Note over B: access token живёт только в памяти вкладки
    B->>API: запрос с Authorization: Bearer
    API->>DB: пользователь активен и token_version совпадает
    API-->>B: 401 по истечении
    B->>API: POST /auth/refresh (cookie)
    API-->>B: новая пара токенов
    Note over B: если refresh вернул другого пользователя или профиль сменился в соседней вкладке — вкладка переключается на реальную сессию
```

Выход, деактивация, смена роли или страны и сброс пароля увеличивают `token_version`: все выданные токены пользователя перестают работать сразу (ADR-003).

### Офлайн-работа уборщика

```mermaid
sequenceDiagram
    autonumber
    participant U as Уборщик
    participant SPA as SPA
    participant Q as Офлайн-очередь (localStorage)
    participant API as HTTP API

    U->>SPA: «Начать работу» без сети
    SPA->>Q: изменение статуса + время
    SPA-->>U: карточка помечена «ожидает синхронизации»
    Note over SPA: сеть вернулась
    SPA->>API: POST /sync/batch (до 200 изменений)
    API->>API: каждое изменение в своей вложенной транзакции
    API-->>SPA: synced + ошибки по каждому изменению
    SPA-->>U: что применено, что отклонено и почему
```

Изменение отклоняется, если задачу изменили на сервере позже офлайн-изменения или переход недопустим; остальные применяются.

### Фото результата

```mermaid
sequenceDiagram
    autonumber
    participant C as Уборщик
    participant API as HTTP API
    participant BL as Blob Storage
    participant M as Менеджер

    C->>API: POST /tasks/{id}/photos (multipart, до 10 МБ)
    API->>API: тип по сигнатуре файла: JPEG, PNG, WebP
    API->>BL: приватный контейнер task-photos
    API-->>C: 201
    M->>API: GET /tasks/{id}/photos
    API->>API: SAS-ссылка: только чтение, 2 часа
    API-->>M: ссылки
    M->>BL: просмотр по ссылке
```

## Статусы задачи

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> in_progress: уборщик / менеджер
    pending --> on_hold
    pending --> cancelled
    in_progress --> on_review: уборщик, если чек-лист и фото готовы
    in_progress --> on_hold: уборщик / менеджер
    in_progress --> pending
    in_progress --> cancelled
    on_hold --> in_progress: уборщик / менеджер
    on_hold --> pending
    on_hold --> cancelled
    on_review --> completed: только менеджер / администратор
    on_review --> in_progress: вернуть на доработку
    completed --> in_progress: переоткрыть
    cancelled --> pending
    completed --> [*]
```

Уборщику доступны только четыре перехода: `pending → in_progress`, `in_progress → on_review`, `in_progress ↔ on_hold`. Принять задачу может только менеджер её страны или администратор.

## Развёртывание локально

`python3 start.py` поднимает PostgreSQL, RabbitMQ и Azurite в Docker (порты открыты только на `127.0.0.1`), накатывает миграции и запускает API, SSE-сервер, relay, consumer и Vite. Vite проксирует `/api`, `/events` и `/blob`, поэтому браузер работает с одним origin.
