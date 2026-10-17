import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import func, select

from src.infrastructure.database.connection import session_scope
from src.scheduler.recurrence import create_occurrences

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 600.0
# Every scheduler replica takes this transaction-level lock first, so one replica does each run.
ADVISORY_LOCK_KEY = 72_001


async def run_once(now: datetime) -> bool:
    """Run every scheduled job in one transaction; return False when another replica holds the lock."""
    async with session_scope() as session, session.begin():
        if not await session.scalar(select(func.pg_try_advisory_xact_lock(ADVISORY_LOCK_KEY))):
            return False
        created = await create_occurrences(session, now)
    logger.info("Scheduler run finished", extra={"occurrences_created": created})
    return True


async def run_scheduler() -> None:
    while True:
        try:
            if not await run_once(datetime.now(UTC)):
                logger.info("Another scheduler holds the lock, skipping this run")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Scheduler run failed")
        await asyncio.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    asyncio.run(run_scheduler())
