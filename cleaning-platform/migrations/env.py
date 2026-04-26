import os
import asyncio
from logging.config import fileConfig

from sqlalchemy import create_engine
from alembic import context

from src.infrastructure.database.connection import Base
from src.infrastructure.database.models import Task

config = context.config
fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = create_engine(
        "postgresql+psycopg2://",
        connect_args={
            "host": "127.0.0.1",
            "port": 5433,
            "dbname": "cleaning_db",
            "user": "cleaning_user",
            "password": "cleaning_pass",
        }
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata
    )
    with context.begin_transaction():
        context.run_migrations()


run_migrations_online()
