import os
import logging
from azure.storage.blob import BlobServiceClient, ContentSettings
from azure.core.exceptions import ResourceExistsError


AZURE_STORAGE_CONNECTION_STRING = os.environ.get(
    "AzureWebJobsStorage",
    "UseDevelopmentStorage=true"
)
CONTAINER_NAME = "task-photos"


def get_blob_service_client() -> BlobServiceClient:
    return BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)


async def ensure_container_exists():
    client = get_blob_service_client()
    try:
        client.create_container(CONTAINER_NAME)
        logging.info(f"Container '{CONTAINER_NAME}' created")
    except ResourceExistsError:
        pass


async def upload_photo(task_id: str, filename: str, data: bytes, content_type: str) -> str:
    await ensure_container_exists()

    client = get_blob_service_client()
    blob_name = f"{task_id}/{filename}"
    blob_client = client.get_blob_client(
        container=CONTAINER_NAME,
        blob=blob_name
    )

    blob_client.upload_blob(
        data,
        overwrite=True,
        content_settings=ContentSettings(content_type=content_type)
    )

    url = f"http://127.0.0.1:10000/devstoreaccount1/{CONTAINER_NAME}/{blob_name}"
    logging.info(f"Photo uploaded: {url}")
    return url


async def get_photos_for_task(task_id: str) -> list[str]:
    await ensure_container_exists()

    client = get_blob_service_client()
    container_client = client.get_container_client(CONTAINER_NAME)

    urls = []
    for blob in container_client.list_blobs(name_starts_with=f"{task_id}/"):
        url = f"http://127.0.0.1:10000/devstoreaccount1/{CONTAINER_NAME}/{blob.name}"
        urls.append(url)

    return urls
