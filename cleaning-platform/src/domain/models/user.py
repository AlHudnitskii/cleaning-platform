import uuid
from dataclasses import dataclass

from src.domain.models.enums import Country, UserRole


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str
    role: UserRole
    country: Country | None

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN

    @property
    def is_manager(self) -> bool:
        return self.role == UserRole.MANAGER

    @property
    def is_cleaner(self) -> bool:
        return self.role == UserRole.CLEANER
