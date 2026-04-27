import os
from logging.config import fileConfig
from sqlalchemy import create_engine
from alembic import context
from src.infrastructure.database.connection import Base
from src.infrastructure.database.models import Task, Location, TaskPhoto, User

config = context.config
fileConfig(config.config_file_name)
target_metadata = Base.metadata


def get_database_url():
    raw_url = os.environ.get("DATABASE_URL", "")
    if raw_url:
        return raw_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    return "postgresql+psycopg2://cleaning_user:cleaning_pass@127.0.0.1:5433/cleaning_db"


def run_migrations_online():
    connectable = create_engine(get_database_url())

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
