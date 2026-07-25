import re
import os
import logging
from typing import Any, Optional

from config import settings

logger = logging.getLogger(__name__)


class DatabaseAdapter:
    def __init__(self) -> None:
        url = os.environ.get("DATABASE_URL", "").strip()
        self._url: str = url if url else str(settings.DATABASE_PATH)
        self._dialect: str = "postgres" if url.startswith("postgresql") else "sqlite"
        self._conn: Any = None

    @property
    def dialect(self) -> str:
        return self._dialect

    def _convert(self, sql: str) -> str:
        if self._dialect == "sqlite":
            return sql
        i = 0
        def _repl(_m: re.Match) -> str:
            nonlocal i
            i += 1
            return f"${i}"
        return re.sub(r"\?", _repl, sql)

    async def connect(self) -> None:
        if self._dialect == "postgres":
            import asyncpg
            self._conn = await asyncpg.connect(self._url)
        else:
            import aiosqlite
            self._conn = await aiosqlite.connect(self._url)
            self._conn.row_factory = aiosqlite.Row
            await self._conn.execute("PRAGMA journal_mode=WAL")
            await self._conn.execute("PRAGMA synchronous=NORMAL")
            await self._conn.execute("PRAGMA foreign_keys=ON")

    async def close(self) -> None:
        if self._conn:
            await self._conn.close()
            self._conn = None

    async def execute(self, sql: str, *params: Any) -> Any:
        sql = self._convert(sql)
        if self._dialect == "postgres":
            if params:
                return await self._conn.execute(sql, *params)
            return await self._conn.execute(sql)
        if params:
            return await self._conn.execute(sql, params)
        return await self._conn.execute(sql)

    async def fetchone(self, sql: str, *params: Any) -> Optional[dict]:
        sql = self._convert(sql)
        if self._dialect == "postgres":
            row = await self._conn.fetchrow(sql, *params) if params else await self._conn.fetchrow(sql)
            return dict(row) if row else None
        cur = await self._conn.execute(sql, params) if params else await self._conn.execute(sql)
        row = await cur.fetchone()
        return dict(row) if row else None

    async def fetchall(self, sql: str, *params: Any) -> list[dict]:
        sql = self._convert(sql)
        if self._dialect == "postgres":
            rows = await self._conn.fetch(sql, *params) if params else await self._conn.fetch(sql)
            return [dict(r) for r in rows]
        cur = await self._conn.execute(sql, params) if params else await self._conn.execute(sql)
        rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def commit(self) -> None:
        if self._dialect == "sqlite":
            await self._conn.commit()

    async def execute_insert(self, sql: str, *params: Any) -> int:
        if self._dialect == "postgres":
            sql = self._convert(sql)
            row = await self._conn.fetchrow(sql, *params)
            return row["id"] if row else 0
        # For SQLite with RETURNING id
        cur = await self._conn.execute(sql, params)
        row = await cur.fetchone()
        await self._conn.commit()
        return row["id"] if row else cur.lastrowid or 0

    async def execute_script(self, sql: str) -> None:
        for stmt in sql.split(";"):
            s = stmt.strip()
            if s:
                await self.execute(s)
        await self.commit()
