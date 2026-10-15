import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://unused:unused@127.0.0.1:1/unused")
os.environ.setdefault("RABBITMQ_URL", "amqp://unused:unused@127.0.0.1:1/")
os.environ.setdefault("JWT_SECRET", "test-access-secret-0123456789abcdef")
os.environ.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret-0123456789abcdef")
os.environ.setdefault("SECURE_COOKIES", "false")
