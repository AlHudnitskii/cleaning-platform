import re
from dataclasses import dataclass

MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_FILENAME_LENGTH = 200


@dataclass(frozen=True)
class ImageType:
    extension: str
    content_type: str


JPEG = ImageType("jpg", "image/jpeg")
PNG = ImageType("png", "image/png")
WEBP = ImageType("webp", "image/webp")


def detect_image_type(data: bytes) -> ImageType | None:
    if data.startswith(b"\xff\xd8\xff"):
        return JPEG
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return WEBP
    return None


def display_filename(filename: str | None, image_type: ImageType) -> str:
    base = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    base = re.sub(r"[^\w.\- ]", "_", base).strip(" .")
    if not base:
        base = f"photo.{image_type.extension}"
    return base[:MAX_FILENAME_LENGTH]
