import os
import aio_pika
import json
import logging
import asyncio


RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")


async def process_task_created(message: aio_pika.IncomingMessage):
    async with message.process():
        body = json.loads(message.body.decode())
        logging.info(f"Processing task.created event: {body}")

        #TODO: base MQ logic

        print(f"Новая задача создана!")
        print(f"ID: {body['task_id']}")
        print(f"Название: {body['title']}")
        print(f"Страна: {body['country']}")
        print(f"Статус: {body['status']}")


async def start_consumer():
    import asyncio

    while True:
        try:
            connection = await aio_pika.connect_robust(RABBITMQ_URL)
            async with connection:
                channel = await connection.channel()
                await channel.set_qos(prefetch_count=10)
                queue = await channel.declare_queue("task.created", durable=True)
                logging.info("Consumer started, waiting for messages...")
                await queue.consume(process_task_created)
                await asyncio.Future()
        except Exception as e:
            logging.error(f"Consumer error: {e}. Retrying in 5 seconds...")
            await asyncio.sleep(5)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(start_consumer())
