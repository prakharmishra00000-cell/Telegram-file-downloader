import asyncio
import hashlib
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable

from telethon import TelegramClient
from telethon.errors import (
    FloodWaitError,
    RPCError,
    FileReferenceExpiredError,
    FileMigrateError,
)
from telethon.tl.types import Message, MessageMediaDocument, Document

from config import settings
from app.database.models import get_db

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1024 * 1024


class DownloadManager:
    def __init__(self, client: TelegramClient) -> None:
        self._client = client
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_DOWNLOADS)
        self._running = True
        self._active: dict[int, asyncio.Task] = {}
        self._paused: set[int] = set()
        self._cancel: set[int] = set()
        self._progress_callback: Optional[Callable] = None
        self._bandwidth_limit: int = 0
        self._rate_limiter: Optional[asyncio.Semaphore] = None

    def set_progress_callback(self, cb: Callable) -> None:
        self._progress_callback = cb

    def set_bandwidth_limit(self, kbps: int) -> None:
        self._bandwidth_limit = kbps * 128

    async def add_chat_to_queue(self, chat_id: int, skip_existing: bool = True) -> int:
        db = await get_db()
        try:
            query = "SELECT id FROM documents WHERE chat_id=?"
            params = [chat_id]
            if skip_existing:
                query += " AND downloaded=0"
            rows = await db.fetchall(query, *params)
            doc_ids = [r["id"] for r in rows]
            if not doc_ids:
                return 0
            return await self.add_to_queue(doc_ids, skip_existing=skip_existing)
        finally:
            await db.close()

    async def add_to_queue(self, document_ids: list[int], use_chat_subfolder: bool = True, duplicate_action: str = "rename", skip_existing: bool = False) -> int:
        db = await get_db()
        try:
            added = 0
            for doc_id in document_ids:
                doc = await db.fetchone("SELECT * FROM documents WHERE id=?", doc_id)
                if not doc:
                    continue

                if skip_existing and doc["downloaded"]:
                    continue

                existing = await db.fetchone(
                    "SELECT id FROM download_queue WHERE document_id=? AND status IN ('pending','downloading')",
                    doc_id,
                )
                if existing:
                    continue

                await db.execute(
                    "INSERT INTO download_queue (document_id, status, max_retries) VALUES (?, 'pending', ?)",
                    doc_id, 5,
                )
                added += 1
            await db.commit()
            return added
        finally:
            await db.close()

    async def process_queue(self) -> None:
        while self._running:
            if len(self._active) >= settings.MAX_CONCURRENT_DOWNLOADS:
                await asyncio.sleep(1)
                continue

            db = await get_db()
            try:
                job = await db.fetchone(
                    """SELECT q.id, q.document_id, d.chat_id, d.message_id, d.file_name, d.file_ext,
                              d.file_size, d.mime_type, d.file_reference
                       FROM download_queue q
                       JOIN documents d ON q.document_id = d.id
                       WHERE q.status = 'pending'
                       ORDER BY q.priority DESC, q.created_at ASC
                       LIMIT 1"""
                )
            finally:
                await db.close()

            if not job:
                await asyncio.sleep(0.5)
                continue

            if job["id"] in self._paused:
                await asyncio.sleep(0.5)
                continue

            task = asyncio.create_task(self._download_worker(job))
            self._active[job["id"]] = task
            task.add_done_callback(lambda t, jid=job["id"]: self._active.pop(jid, None))

    async def _update_progress(self, job_id: int, pct: float, spd: float) -> None:
        db = await get_db()
        try:
            await db.execute("UPDATE download_queue SET progress=?, speed=? WHERE id=?", pct, spd, job_id)
            await db.commit()
        finally:
            await db.close()

    async def _download_worker(self, job) -> None:
        job_id = job["id"]
        doc_id = job["document_id"]
        chat_id = job["chat_id"]
        msg_id = job["message_id"]
        file_name = job["file_name"]
        file_ext = job["file_ext"]
        file_size = job["file_size"] or 0

        if job_id in self._cancel:
            self._cancel.discard(job_id)
            return

        db = await get_db()
        try:
            await db.execute(
                "UPDATE download_queue SET status='downloading', started_at=CURRENT_TIMESTAMP WHERE id=?", job_id,
            )
            await db.commit()
        finally:
            await db.close()

        download_dir = Path(settings.DOWNLOAD_DIRECTORY)

        chat_name = f"chat_{chat_id}"
        db2 = await get_db()
        try:
            row = await db2.fetchone("SELECT name FROM dialogs WHERE peer_id=?", chat_id)
            if row:
                cn = row["name"]
                cn = "".join(c if c.isalnum() or c in " _-" else "_" for c in cn)
                chat_name = cn.strip() or f"chat_{chat_id}"
        finally:
            await db2.close()

        file_path = download_dir / file_name
        if not file_name:
            file_name = f"document_{msg_id}.{file_ext}" if file_ext else f"document_{msg_id}"
            file_path = download_dir / file_name

        if file_path.exists():
            stem = file_path.stem
            suffix = file_path.suffix
            counter = 1
            while file_path.exists():
                file_path = download_dir / f"{stem}_{counter}{suffix}"
                counter += 1

        file_path.parent.mkdir(parents=True, exist_ok=True)

        max_retries = 5
        retry_count = 0
        success = False
        error_msg = ""
        sha256_val = ""
        downloaded_size = 0
        start_time = time.time()
        speed = 0.0
        progress_state = {"last_pct": -1, "last_time": 0.0}

        def _progress(current: int, total: int) -> None:
            nonlocal file_size
            if total > 0:
                file_size = total
            pct = (current / total * 100) if total > 0 else 0
            now = time.time()
            if int(pct) <= progress_state["last_pct"] or now - progress_state["last_time"] < 1.0:
                return
            progress_state["last_pct"] = int(pct)
            progress_state["last_time"] = now
            elapsed = now - start_time
            spd = current / elapsed if elapsed > 0 else 0
            if self._progress_callback:
                self._progress_callback(job_id, pct, spd)
            loop = asyncio.get_event_loop()
            asyncio.run_coroutine_threadsafe(
                self._update_progress(job_id, pct, spd), loop
            )

        while retry_count < max_retries and job_id not in self._cancel:
            try:
                async with self._semaphore:
                    msg = await self._client.get_messages(chat_id, ids=msg_id)
                    if not msg or not msg.media:
                        raise FileNotFoundError(f"Message {msg_id} not found or has no media")

                    download_start = time.time()
                    progress_state["last_pct"] = -1
                    progress_state["last_time"] = 0.0

                    try:
                        result = await asyncio.wait_for(
                            self._client.download_media(
                                msg, file=str(file_path), progress_callback=_progress,
                            ),
                            timeout=600,
                        )
                    except asyncio.TimeoutError:
                        logger.warning("download_media timed out for %s (file may be on disk)", file_name)
                        result = None

                    sha256_val = ""
                    actual_size = 0
                    try:
                        if file_path.exists():
                            actual_size = file_path.stat().st_size
                        if actual_size > 0:
                            with open(file_path, "rb") as f:
                                h = hashlib.sha256()
                                while chunk := f.read(65536):
                                    h.update(chunk)
                                sha256_val = h.hexdigest()
                    except Exception as exc:
                        logger.warning("SHA/file check failed: %s", exc)

                    db3 = await get_db()
                    try:
                        await db3.execute(
                            "UPDATE download_queue SET status='completed', progress=100, speed=0, "
                            "completed_at=CURRENT_TIMESTAMP, retry_count=? WHERE id=?",
                            retry_count, job_id,
                        )
                        await db3.execute(
                            "UPDATE documents SET downloaded=1, local_path=?, sha256=? WHERE id=?",
                            str(file_path), sha256_val, doc_id,
                        )
                        row = await db3.fetchone(
                            "SELECT COALESCE(dia.name, 'Unknown') as cn FROM documents d "
                            "LEFT JOIN dialogs dia ON d.chat_id = dia.peer_id WHERE d.id=?", doc_id,
                        )
                        chat_name_for_history = row["cn"] if row else "Unknown"
                        await db3.execute(
                            "INSERT INTO download_history (chat_name, chat_id, file_name, original_name, extension, file_size, sha256, message_id, sender_name, message_date, download_date, local_path, retry_count, status) "
                            "SELECT COALESCE(dia.name, 'Unknown'), d.chat_id, ?, d.file_name, d.file_ext, d.file_size, ?, d.message_id, d.sender_name, d.message_date, CURRENT_TIMESTAMP, ?, ?, 'completed' "
                            "FROM documents d LEFT JOIN dialogs dia ON d.chat_id = dia.peer_id WHERE d.id=?",
                            file_name, sha256_val, str(file_path), retry_count, doc_id,
                        )
                        await db3.commit()
                    except Exception as exc:
                        logger.error("Failed to mark download completed: %s", exc)
                        raise
                    finally:
                        await db3.close()

                    success = True
                    logger.info("Downloaded: %s (%s)", file_name, sha256_val[:16] if sha256_val else "no hash")
                    break

            except FloodWaitError as e:
                wait = e.seconds + 5
                logger.warning("Flood wait %ss for %s", wait, file_name)
                await asyncio.sleep(wait)
                retry_count += 1
            except FileReferenceExpiredError:
                logger.warning("File ref expired, retrying %s", file_name)
                retry_count += 1
                await asyncio.sleep(1)
            except FileMigrateError as e:
                logger.warning("File migrate to DC %s", e)
                retry_count += 1
                await asyncio.sleep(2)
            except RPCError as e:
                logger.error("RPC error downloading %s: %s", file_name, e)
                error_msg = str(e)
                retry_count += 1
                await asyncio.sleep(2 ** retry_count)
            except (OSError, IOError) as e:
                logger.error("File error downloading %s: %s", file_name, e)
                error_msg = str(e)
                retry_count += 1
                await asyncio.sleep(1)
            except Exception as e:
                logger.exception("Unexpected error downloading %s", file_name)
                error_msg = str(e)
                retry_count += 1
                await asyncio.sleep(2 ** retry_count)

        if not success:
            db5 = await get_db()
            try:
                await db5.execute(
                    "UPDATE download_queue SET status='failed', retry_count=?, error=? WHERE id=?",
                    retry_count, error_msg[:500], job_id,
                )
                await db5.commit()
            finally:
                await db5.close()
            logger.error("Failed to download %s after %d retries: %s", file_name, retry_count, error_msg)

        self._cancel.discard(job_id)

    async def pause_job(self, job_id: int) -> None:
        self._paused.add(job_id)
        db = await get_db()
        try:
            await db.execute("UPDATE download_queue SET status='paused' WHERE id=?", job_id)
            await db.commit()
        finally:
            await db.close()

    async def resume_job(self, job_id: int) -> None:
        self._paused.discard(job_id)
        db = await get_db()
        try:
            await db.execute("UPDATE download_queue SET status='pending' WHERE id=?", job_id)
            await db.commit()
        finally:
            await db.close()

    async def cancel_job(self, job_id: int) -> None:
        self._cancel.add(job_id)
        self._paused.discard(job_id)
        if job_id in self._active:
            self._active[job_id].cancel()
            del self._active[job_id]
        db = await get_db()
        try:
            await db.execute("UPDATE download_queue SET status='cancelled' WHERE id=?", job_id)
            await db.commit()
        finally:
            await db.close()

    async def retry_job(self, job_id: int) -> None:
        db = await get_db()
        try:
            await db.execute("UPDATE download_queue SET status='pending', retry_count=0, error=NULL WHERE id=?", job_id)
            await db.commit()
        finally:
            await db.close()

    async def retry_all_failed(self) -> int:
        db = await get_db()
        try:
            rows = await db.fetchall("SELECT id FROM download_queue WHERE status='failed'")
            for r in rows:
                await db.execute("UPDATE download_queue SET status='pending', retry_count=0, error=NULL WHERE id=?", r["id"])
            await db.commit()
            return len(rows)
        finally:
            await db.close()

    async def clear_completed(self) -> int:
        db = await get_db()
        try:
            await db.execute("DELETE FROM download_queue WHERE status IN ('completed','cancelled')")
            await db.commit()
            return 0
        finally:
            await db.close()

    async def get_queue(self) -> list[dict]:
        db = await get_db()
        try:
            rows = await db.fetchall(
                """SELECT q.*, d.file_name, d.file_size, d.chat_id, COALESCE(di.name, 'Unknown') as chat_name
                   FROM download_queue q
                   JOIN documents d ON q.document_id = d.id
                   LEFT JOIN dialogs di ON d.chat_id = di.peer_id
                   ORDER BY q.created_at DESC"""
            )
            return rows
        finally:
            await db.close()

    async def get_summary(self) -> dict:
        db = await get_db()
        try:
            p = await db.fetchone("SELECT COUNT(*) as c FROM download_queue WHERE status='pending'")
            dw = await db.fetchone("SELECT COUNT(*) as c FROM download_queue WHERE status='downloading'")
            c = await db.fetchone("SELECT COUNT(*) as c FROM download_queue WHERE status='completed'")
            f = await db.fetchone("SELECT COUNT(*) as c FROM download_queue WHERE status='failed'")
            tb = await db.fetchone("SELECT COALESCE(SUM(d.file_size), 0) as s FROM download_queue q JOIN documents d ON q.document_id = d.id")
            db_bytes = await db.fetchone("SELECT COALESCE(SUM(d.file_size), 0) as s FROM download_queue q JOIN documents d ON q.document_id = d.id WHERE q.status IN ('completed')")

            total = (p["c"] if p else 0) + (dw["c"] if dw else 0) + (c["c"] if c else 0) + (f["c"] if f else 0)
            total_bytes = tb["s"] if tb else 0
            downloaded_bytes = db_bytes["s"] if db_bytes else 0
            progress = (downloaded_bytes / total_bytes * 100) if total_bytes > 0 else 0

            return {
                "pending": p["c"] if p else 0,
                "downloading": dw["c"] if dw else 0,
                "completed": c["c"] if c else 0,
                "failed": f["c"] if f else 0,
                "skipped": 0,
                "total": total,
                "total_bytes": total_bytes,
                "downloaded_bytes": downloaded_bytes,
                "overall_progress": round(progress, 1),
            }
        finally:
            await db.close()

    def stop(self) -> None:
        self._running = False

    async def resume_unfinished(self) -> None:
        db = await get_db()
        try:
            await db.execute("UPDATE download_queue SET status='pending' WHERE status IN ('downloading','paused')")
            await db.commit()
        finally:
            await db.close()
