from src.domain.models.enums import Country, LocationLevel, TaskStatus
from src.translations import Phrase, Plural, Text

AND = Phrase(" and ", " и ")

STATUS = {
    TaskStatus.PENDING: Phrase("Pending", "Ожидает"),
    TaskStatus.IN_PROGRESS: Phrase("In progress", "В работе"),
    TaskStatus.ON_REVIEW: Phrase("On review", "На проверке"),
    TaskStatus.COMPLETED: Phrase("Completed", "Выполнена"),
    TaskStatus.ON_HOLD: Phrase("On hold", "Приостановлена"),
    TaskStatus.CANCELLED: Phrase("Cancelled", "Отменена"),
}

COUNTRY = {
    Country.DE: Phrase("Germany", "Германия"),
    Country.DK: Phrase("Denmark", "Дания"),
    Country.IT: Phrase("Italy", "Италия"),
    Country.AU: Phrase("Australia", "Австралия"),
    Country.US: Phrase("United States", "США"),
    Country.GB: Phrase("United Kingdom", "Великобритания"),
    Country.FR: Phrase("France", "Франция"),
    Country.ES: Phrase("Spain", "Испания"),
    Country.PL: Phrase("Poland", "Польша"),
    Country.NL: Phrase("Netherlands", "Нидерланды"),
    Country.SE: Phrase("Sweden", "Швеция"),
    Country.NO: Phrase("Norway", "Норвегия"),
    Country.FI: Phrase("Finland", "Финляндия"),
    Country.CH: Phrase("Switzerland", "Швейцария"),
    Country.AT: Phrase("Austria", "Австрия"),
}

LEVEL = {
    LocationLevel.COUNTRY: Phrase("country", "страну"),
    LocationLevel.CITY: Phrase("city", "город"),
    LocationLevel.BUILDING: Phrase("building", "здание"),
    LocationLevel.FLOOR: Phrase("floor", "этаж"),
    LocationLevel.ROOM: Phrase("room", "помещение"),
}

PARENT_LEVEL = {
    LocationLevel.COUNTRY: Phrase("country", "страны"),
    LocationLevel.CITY: Phrase("city", "города"),
    LocationLevel.BUILDING: Phrase("building", "здания"),
    LocationLevel.FLOOR: Phrase("floor", "этажа"),
    LocationLevel.ROOM: Phrase("room", "помещения"),
}

TASK = Phrase("Task", "Задача")
USER = Phrase("User", "Пользователь")
LOCATION = Phrase("Location", "Локация")
PARENT_LOCATION = Phrase("Parent location", "Родительская локация")
CHECKLIST_ITEM = Phrase("Checklist item", "Пункт чек-листа")
CHECKLIST_TEMPLATE = Phrase("Checklist template", "Шаблон чек-листа")

FIELD = {
    "title": Phrase("Title", "Название"),
    "description": Phrase("Description", "Описание"),
    "email": Phrase("Email", "Email"),
    "password": Phrase("Password", "Пароль"),
    "new_password": Phrase("New password", "Новый пароль"),
    "old_password": Phrase("Current password", "Текущий пароль"),
    "role": Phrase("Role", "Роль"),
    "country": Phrase("Country", "Страна"),
    "name": Phrase("Name", "Название"),
    "level": Phrase("Level", "Уровень"),
    "parent_id": Phrase("Parent location", "Родительская локация"),
    "location_id": Phrase("Location", "Локация"),
    "assigned_to": Phrase("Assignee", "Исполнитель"),
    "priority": Phrase("Priority", "Приоритет"),
    "status": Phrase("Status", "Статус"),
    "due_date": Phrase("Due date", "Срок"),
    "rrule": Phrase("Repeat rule", "Правило повтора"),
    "text": Phrase("Text", "Текст"),
    "comment": Phrase("Comment", "Комментарий"),
    "score": Phrase("Score", "Оценка"),
    "checklist": Phrase("Checklist", "Чек-лист"),
    "photo_required": Phrase("Photo requirement", "Требование фото"),
    "done": Phrase("Done", "Выполнено"),
    "items": Phrase("Steps", "Пункты"),
    "endpoint": Phrase("Push endpoint", "Адрес push-подписки"),
}

NOT_FOUND = Phrase("{entity} not found", "{entity}: не найдено")
INTERNAL_ERROR = Phrase("Internal server error", "Внутренняя ошибка сервера")
FIELD_TOO_MANY = Phrase("{field}: at most {max_length} items", "{field}: не больше {max_length} элементов")
FORBIDDEN = Phrase("You do not have access to this action", "У вас нет доступа к этому действию")

INVALID_JSON = Phrase("The request body is not valid JSON", "Тело запроса — не корректный JSON")
JSON_NOT_OBJECT = Phrase("The request body must be a JSON object", "Тело запроса должно быть JSON-объектом")
VALIDATION_FAILED = Phrase("Please check the entered values", "Проверьте введённые значения")
INVALID_ID = Phrase("Invalid {label}", "Неверный идентификатор: {label}")
INVALID_DATE = Phrase("Invalid {label}. Use YYYY-MM-DD", "Неверная дата в {label}. Формат: ГГГГ-ММ-ДД")
NOT_INTEGER = Phrase("{name} must be an integer", "{name} должно быть целым числом")
OUT_OF_RANGE = Phrase("{name} must be between {minimum} and {maximum}", "{name} должно быть от {minimum} до {maximum}")
TEXT_TOO_LONG = Phrase("{name} must be at most {max_length} characters", "{name}: не больше {max_length} символов")
NOT_A_CHOICE = Phrase("{name} must be one of: {allowed}", "{name}: допустимые значения — {allowed}")

FIELD_REQUIRED = Phrase("{field}: this field is required", "{field}: обязательное поле")
FIELD_TOO_SHORT = Phrase("{field}: at least {min_length} characters", "{field}: не меньше {min_length} символов")
FIELD_TOO_LONG = Phrase("{field}: at most {max_length} characters", "{field}: не больше {max_length} символов")
FIELD_INVALID_EMAIL = Phrase("{field}: not a valid email address", "{field}: некорректный адрес почты")
FIELD_INVALID_CHOICE = Phrase("{field}: choose one of {expected}", "{field}: выберите одно из значений {expected}")
FIELD_INVALID_ID = Phrase("{field}: not a valid ID", "{field}: некорректный идентификатор")
FIELD_INVALID_NUMBER = Phrase("{field}: must be a whole number", "{field}: должно быть целым числом")
FIELD_INVALID_BOOLEAN = Phrase("{field}: must be true or false", "{field}: должно быть true или false")
FIELD_INVALID_DATE = Phrase("{field}: not a valid date", "{field}: некорректная дата")
FIELD_TOO_SMALL = Phrase("{field}: must be at least {limit}", "{field}: не меньше {limit}")
FIELD_TOO_BIG = Phrase("{field}: must be at most {limit}", "{field}: не больше {limit}")
FIELD_INVALID = Phrase("{field}: invalid value", "{field}: некорректное значение")
FIELD_PATTERN = Phrase("{field}: invalid format", "{field}: неверный формат")

PASSWORD_TOO_SHORT = Phrase(
    "Password must be at least {length} characters", "Пароль должен быть не короче {length} символов"
)
COUNTRY_REQUIRED_FOR_ROLE = Phrase(
    "Country is required for manager and cleaner roles", "Для менеджера и уборщика нужно указать страну"
)
TITLE_TOO_SHORT = Phrase("Title must be at least 3 characters", "Название должно быть не короче 3 символов")
TITLE_EMPTY = Phrase("Title cannot be empty", "Название не может быть пустым")
NAME_TOO_SHORT = Phrase("Name must be at least 2 characters", "Название должно быть не короче 2 символов")
INVALID_RRULE = Phrase("Invalid repeat rule", "Некорректное правило повтора")
CHECKLIST_TEXT_REQUIRED = Phrase("Checklist item text is required", "Укажите текст пункта чек-листа")
CHECKLIST_TEXT_TOO_LONG = Phrase(
    "Checklist items must be at most 255 characters", "Пункт чек-листа — не больше 255 символов"
)
PHOTO_REQUIREMENT_EMPTY = Phrase("Photo requirement cannot be empty", "Требование фото не может быть пустым")
PRIORITY_EMPTY = Phrase("Priority cannot be empty", "Приоритет не может быть пустым")
COMMENT_REQUIRED = Phrase("Comment text is required", "Напишите текст комментария")
DONE_NOT_BOOLEAN = Phrase("Done must be true or false", "Поле «выполнено» должно быть true или false")

REFRESH_MISSING = Phrase("Refresh token is missing", "Нет токена обновления сессии")
REFRESH_INVALID = Phrase("Invalid or expired refresh token", "Токен обновления недействителен или истёк")
SESSION_INVALID = Phrase("Session is no longer valid", "Сессия больше не действительна")
TOO_MANY_SIGN_INS = Phrase(
    "Too many failed sign-in attempts. Try again later.",
    "Слишком много неудачных попыток входа. Попробуйте позже.",
)
WRONG_CREDENTIALS = Phrase("Invalid email or password", "Неверный email или пароль")
USER_DISABLED = Phrase("User is disabled", "Пользователь деактивирован")
AUTH_HEADER_MISSING = Phrase("Authorization header missing", "Нет заголовка авторизации")
AUTH_HEADER_INVALID = Phrase(
    "Invalid authorization format. Use: Bearer <token>", "Неверный формат авторизации. Нужно: Bearer <token>"
)
TOKEN_EXPIRED = Phrase("Token has expired", "Срок действия токена истёк")
TOKEN_INVALID = Phrase("Invalid token", "Недействительный токен")

EMAIL_TAKEN = Phrase("Email already registered", "Этот email уже зарегистрирован")
OWN_ACCESS_LOCKED = Phrase("You cannot change your own role or country", "Свою роль и страну изменить нельзя")
REASSIGN_FIRST = Phrase(
    "Reassign this cleaner's open tasks first ({count})",
    "Сначала переназначьте открытые задачи этого уборщика ({count})",
)
OWN_PASSWORD_IN_PROFILE = Phrase("Change your own password in your profile", "Свой пароль меняйте в профиле")
CANNOT_DEACTIVATE_SELF = Phrase("Cannot deactivate yourself", "Нельзя деактивировать самого себя")
OLD_PASSWORD_WRONG = Phrase("Old password is incorrect", "Текущий пароль указан неверно")

CREATE_IN_OWN_COUNTRY = Phrase(
    "You can only create tasks in your country", "Создавать задачи можно только в своей стране"
)
EDIT_IN_OWN_COUNTRY = Phrase("You can only edit tasks in your country", "Изменять задачи можно только в своей стране")
DELETE_IN_OWN_COUNTRY = Phrase(
    "You can only delete tasks in your country", "Удалять задачи можно только в своей стране"
)
NOTHING_TO_UPDATE = Phrase("Nothing to update", "Нечего изменять")
LOCATION_OTHER_COUNTRY = Phrase(
    "Location must be in the task's country", "Локация должна быть в той же стране, что и задача"
)
NOT_RECURRING = Phrase("Task is not recurring", "Задача не повторяется")
REVIEW_ONLY_COMPLETED = Phrase("Can only review completed tasks", "Оценить можно только выполненную задачу")
ASSIGNEE_NOT_ALLOWED = Phrase(
    "Assignee must be an active cleaner from the task's country",
    "Исполнителем может быть только активный уборщик из страны задачи",
)
STATUS_CHANGE_NOT_ALLOWED = Phrase(
    "Cannot change status from “{current}” to “{target}”",
    "Нельзя сменить статус «{current}» на «{target}»",
)
BEFORE_REVIEW = Phrase("Before sending for review, {steps}", "Перед отправкой на проверку {steps}")
UPLOAD_PHOTO_STEP = Phrase("upload a photo of the result", "загрузите фото результата")
FINISH_CHECKLIST_STEP = Phrase(
    "finish the checklist ({done} of {total} done)", "выполните чек-лист (готово {done} из {total})"
)

CHECKLIST_MANAGERS_ONLY = Phrase(
    "Only managers of this country can change the checklist",
    "Менять чек-лист могут только менеджеры этой страны",
)
CHECKLIST_LOCKED = Phrase(
    "The checklist of a completed or cancelled task cannot be changed",
    "Чек-лист выполненной или отменённой задачи менять нельзя",
)
CHECKLIST_TOO_LONG = Phrase(
    "A checklist can have at most {limit} items", "В чек-листе может быть не больше {limit} пунктов"
)
CANNOT_TICK = Phrase("You cannot tick items of this task", "Отмечать пункты этой задачи вы не можете")

TEMPLATE_EMPTY = Phrase("A template needs at least one step", "В шаблоне должен быть хотя бы один пункт")
TEMPLATE_NAME_TAKEN = Phrase(
    "A template with this name already exists in this country", "Шаблон с таким названием в этой стране уже есть"
)
TEMPLATE_COUNTRY_REQUIRED = Phrase("Choose the country of the template", "Укажите страну шаблона")
TEMPLATE_IN_OWN_COUNTRY = Phrase(
    "You can only create templates in your country", "Создавать шаблоны можно только в своей стране"
)
TEMPLATES_TOO_MANY = Phrase(
    "A country can have at most {limit} templates", "В одной стране может быть не больше {limit} шаблонов"
)

NO_PHOTO = Phrase("No photo file provided. Use form-data with key 'photo'", "Файл фото не передан (поле формы «photo»)")
PHOTO_TOO_LARGE = Phrase("Photo must be at most {megabytes} MB", "Фото должно быть не больше {megabytes} МБ")
PHOTO_TYPE = Phrase("Only JPEG, PNG and WebP images are supported", "Поддерживаются только JPEG, PNG и WebP")

PARENT_OTHER_COUNTRY = Phrase(
    "Child location must be in the same country as its parent",
    "Вложенная локация должна быть в той же стране, что и родительская",
)
LEVEL_NOT_ALLOWED = Phrase("A {level} cannot be placed inside a {parent}", "Нельзя добавить {level} внутрь {parent}")
LOCATION_HAS_CHILDREN = Phrase(
    "Delete or move the nested locations first", "Сначала удалите или перенесите вложенные локации"
)
LOCATION_IN_USE = Phrase("This location is used by {tasks}", "Локация используется в {tasks}")

SYNC_NOT_A_LIST = Phrase("changes must be a list", "changes должно быть списком")
SYNC_TOO_MANY = Phrase("At most {limit} changes per batch", "Не больше {limit} изменений за раз")
SYNC_CONFLICT = Phrase(
    "Task was changed on the server after this offline change",
    "Задачу изменили на сервере после этого офлайн-изменения",
)

PERIOD_REQUIRED = Phrase("date_from and date_to are required (YYYY-MM-DD)", "Укажите date_from и date_to (ГГГГ-ММ-ДД)")
PERIOD_REVERSED = Phrase("The start date must not be after the end date", "Дата начала не может быть позже даты конца")
EXPORT_PERIOD_TOO_LONG = Phrase("Export period must not exceed {days} days", "Период выгрузки — не больше {days} дней")
REPORT_PERIOD_TOO_LONG = Phrase("Report period must not exceed {days} days", "Период отчёта — не больше {days} дней")

IMPORT_UNREADABLE = Phrase(
    "Failed to parse file. Check that it is a valid CSV or Excel file",
    "Не удалось прочитать файл. Проверьте, что это корректный CSV или Excel",
)
IMPORT_FORMAT = Phrase(
    "Unsupported file format. Use CSV or Excel (.xlsx)", "Формат не поддерживается. Нужен CSV или Excel (.xlsx)"
)
IMPORT_NO_FILE = Phrase("No file provided. Use form-data with key 'file'", "Файл не передан (поле формы «file»)")
IMPORT_TOO_LARGE = Phrase("File must be at most {megabytes} MB", "Файл должен быть не больше {megabytes} МБ")
IMPORT_MISSING_COLUMNS = Phrase("Missing required columns: {columns}", "Нет обязательных столбцов: {columns}")
IMPORT_TOO_MANY_ROWS = Phrase("File must contain at most {limit} rows", "В файле должно быть не больше {limit} строк")
IMPORT_ROW = Phrase("Row {row}: {message}", "Строка {row}: {message}")
ROW_TITLE_TOO_SHORT = Phrase("title must be at least 3 characters", "название должно быть не короче 3 символов")
ROW_TITLE_TOO_LONG = Phrase(
    "title must be at most {limit} characters", "название должно быть не длиннее {limit} символов"
)
ROW_BAD_COUNTRY = Phrase("invalid country '{value}'", "неизвестная страна «{value}»")
ROW_BAD_PRIORITY = Phrase("invalid priority '{value}'", "неизвестный приоритет «{value}»")
ROW_DESCRIPTION_TOO_LONG = Phrase(
    "description must be at most {limit} characters", "описание должно быть не длиннее {limit} символов"
)
ROW_BAD_RRULE = Phrase("invalid rrule '{value}'", "некорректное правило повтора «{value}»")
ROW_BAD_ASSIGNEE_ID = Phrase("assigned_to must be a user ID", "assigned_to должно быть ID пользователя")
ROW_LOCATION_MISSING = Phrase("location '{name}' not found in {country}", "локация «{name}» не найдена в {country}")
ROW_LOCATION_AMBIGUOUS = Phrase(
    "location name '{name}' is ambiguous", "названию «{name}» соответствует несколько локаций"
)
ROW_ASSIGNEE_NOT_ALLOWED = Phrase(
    "assignee must be an active cleaner from the task's country",
    "исполнитель должен быть активным уборщиком из страны задачи",
)

PUSH_ASSIGNED_TITLE = Phrase("New task assigned", "Вам назначена задача")
PUSH_ASSIGNED_BODY = Phrase("You have been assigned: {title}", "Новая задача: {title}")
PUSH_CREATED_TITLE = Phrase("New task created", "Создана задача")
PUSH_CREATED_BODY = Phrase("{title} ({country})", "{title} ({country})")
PUSH_STATUS_TITLE = Phrase("Task status updated", "Статус задачи изменён")
PUSH_STATUS_BODY = Phrase("{title}: {old} → {new}", "{title}: {old} → {new}")
PUSH_DUE_SOON_TITLE = Phrase("Due tomorrow", "Срок завтра")
PUSH_DUE_SOON_BODY = Phrase("{title} is due tomorrow", "Задачу «{title}» нужно выполнить завтра")
PUSH_OVERDUE_TITLE = Phrase("Task overdue", "Задача просрочена")
PUSH_OVERDUE_BODY = Phrase("{title} is past its due date", "У задачи «{title}» прошёл срок")


def tasks_count(n: int) -> Plural:
    return Plural(n, en=("task", "tasks"), ru=("задаче", "задачах", "задачах"))


def country_name(code: str) -> object:
    try:
        return COUNTRY[Country(code)]()
    except ValueError:
        return code


def status_name(status: TaskStatus | str) -> Text:
    return STATUS[TaskStatus(status)]()
