from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    CLEANER = "cleaner"


class Country(StrEnum):
    DE = "DE"
    DK = "DK"
    IT = "IT"
    AU = "AU"
    US = "US"
    GB = "GB"
    FR = "FR"
    ES = "ES"
    PL = "PL"
    NL = "NL"
    SE = "SE"
    NO = "NO"
    FI = "FI"
    CH = "CH"
    AT = "AT"


class TaskStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    ON_REVIEW = "on_review"
    COMPLETED = "completed"
    ON_HOLD = "on_hold"
    CANCELLED = "cancelled"


class LocationLevel(StrEnum):
    COUNTRY = "country"
    CITY = "city"
    BUILDING = "building"
    FLOOR = "floor"
    ROOM = "room"

class TaskPriority(StrEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"
