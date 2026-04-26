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


class TaskStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class LocationLevel(StrEnum):
    COUNTRY = "country"
    CITY = "city"
    BUILDING = "building"
    FLOOR = "floor"
    ROOM = "room"
