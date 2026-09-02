import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

load_dotenv()

async def main():
    engine = create_async_engine(os.getenv("DATABASE_URL"))
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version()"))
            print("Connection successful!")
            print(result.scalar())
    except Exception as e:
        print(f"Failed to connect: {e}")
    finally:
        await engine.dispose()

asyncio.run(main())