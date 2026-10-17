from src.api.schemas.user import UserResponse
from src.domain.models.enums import Country, UserRole
from src.infrastructure.blob.storage import read_link
from src.infrastructure.database.models import User


def user_response(user: User) -> UserResponse:
    """Map a user row to the API shape; the stored avatar URL becomes a short-lived read link."""
    return UserResponse(
        id=user.id,
        email=user.email,
        role=UserRole(user.role),
        country=Country(user.country) if user.country else None,
        full_name=user.full_name,
        phone=user.phone,
        avatar_url=read_link(user.avatar_url) if user.avatar_url else None,
        is_active=user.is_active,
        created_at=user.created_at,
    )
