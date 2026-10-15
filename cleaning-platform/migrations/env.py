from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from src.infrastructure.database import models
from src.settings import get_settings

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = models.Base.metadata


def sync_database_url() -> str:
    return get_settings().database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")


def run_migrations_online() -> None:
    connectable = create_engine(sync_database_url())
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
