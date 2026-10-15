from contextlib import suppress

from azure.core.exceptions import ResourceExistsError
from azure.storage.blob import ContentSettings
from azure.storage.blob.aio import BlobServiceClient

from src.settings import get_settings

PHOTOS_CONTAINER = "task-photos"
EXPORTS_CONTAINER = "exports"


def _client() -> BlobServiceClient:
    return BlobServiceClient.from_connection_string(get_settings().storage_connection_string)


async def upload_blob(container: str, name: str, data: bytes, content_type: str) -> str:
    async with _client() as client:
        container_client = client.get_container_client(container)
        with suppress(ResourceExistsError):
            await container_client.create_container()
        blob = container_client.get_blob_client(name)
        await blob.upload_blob(data, overwrite=False, content_settings=ContentSettings(content_type=content_type))
        return blob.url
