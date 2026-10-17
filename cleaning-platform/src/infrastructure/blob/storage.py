from contextlib import suppress
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from urllib.parse import urlsplit

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.storage.blob import BlobClient, BlobSasPermissions, ContentSettings, generate_blob_sas
from azure.storage.blob import BlobServiceClient as SyncBlobServiceClient
from azure.storage.blob.aio import BlobServiceClient

from src.settings import get_settings

PHOTOS_CONTAINER = "task-photos"
EXPORTS_CONTAINER = "exports"
READ_LINK_LIFETIME = timedelta(hours=2)
CLOCK_SKEW = timedelta(minutes=5)


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


async def delete_prefix(container: str, prefix: str) -> int:
    deleted = 0
    async with _client() as client:
        container_client = client.get_container_client(container)
        with suppress(ResourceNotFoundError):
            async for blob in container_client.list_blobs(name_starts_with=prefix):
                await container_client.delete_blob(blob.name)
                deleted += 1
    return deleted


@lru_cache
def _signing_key(connection_string: str) -> tuple[str, str] | None:
    client = SyncBlobServiceClient.from_connection_string(connection_string)
    key = getattr(client.credential, "account_key", None)
    return (client.account_name, key) if client.account_name and key else None


def public_url(blob_url: str) -> str:
    base = get_settings().blob_public_url
    if not base:
        return blob_url
    parts = urlsplit(blob_url)
    query = f"?{parts.query}" if parts.query else ""
    return f"{base.rstrip('/')}{parts.path}{query}"


def read_link(blob_url: str, now: datetime | None = None) -> str:
    signing = _signing_key(get_settings().storage_connection_string)
    if signing is None:
        return public_url(blob_url)
    account, key = signing
    blob = BlobClient.from_blob_url(blob_url)
    moment = now or datetime.now(UTC)
    token = generate_blob_sas(
        account_name=account,
        container_name=blob.container_name,
        blob_name=blob.blob_name,
        account_key=key,
        permission=BlobSasPermissions(read=True),
        start=moment - CLOCK_SKEW,
        expiry=moment + READ_LINK_LIFETIME,
    )
    return public_url(f"{blob_url.split('?', 1)[0]}?{token}")
