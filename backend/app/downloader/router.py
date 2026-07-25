import logging
import tempfile
import os
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.auth.client import client_manager
from app.downloader.manager import DownloadManager
from app.schemas.models import DownloadRequest, DownloadSettings, QueueSummary, DownloadQueueOut
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/download", tags=["download"])

_manager: Optional[DownloadManager] = None


def _get_manager():
    global _manager
    if _manager is None:
        if not client_manager.client:
            raise HTTPException(status_code=401, detail="Not authenticated")
        _manager = DownloadManager(client_manager.client)
    return _manager


@router.post("/queue/chat/{chat_id}")
async def add_chat_to_queue(chat_id: int, skip_existing: bool = Query(True)):
    if not client_manager.is_connected or not client_manager.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated")
    mgr = _get_manager()
    count = await mgr.add_chat_to_queue(chat_id, skip_existing=skip_existing)
    if count > 0:
        import asyncio
        asyncio.create_task(mgr.process_queue())
    return {"added": count, "total_in_chat": count}


@router.post("/queue")
async def add_to_queue(req: DownloadRequest):
    if not client_manager.is_connected or not client_manager.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated")
    mgr = _get_manager()
    count = await mgr.add_to_queue(
        req.document_ids,
        use_chat_subfolder=req.use_chat_subfolder,
        duplicate_action=req.duplicate_action,
        skip_existing=req.skip_existing,
    )
    # Trigger queue processing
    import asyncio
    asyncio.create_task(mgr.process_queue())
    return {"added": count}


@router.post("/queue/start")
async def start_queue():
    mgr = _get_manager()
    import asyncio
    asyncio.create_task(mgr.process_queue())
    return {"started": True}


@router.get("/queue", response_model=list[DownloadQueueOut])
async def get_queue():
    from app.database.models import get_db
    db = await get_db()
    try:
        rows = await db.fetchall(
            """SELECT q.*, d.file_name, d.file_size, d.chat_id, COALESCE(di.name, 'Unknown') as chat_name
               FROM download_queue q
               JOIN documents d ON q.document_id = d.id
               LEFT JOIN dialogs di ON d.chat_id = di.peer_id
               ORDER BY q.created_at DESC"""
        )
        return [
            DownloadQueueOut(
                id=r["id"],
                document_id=r["document_id"],
                file_name=r["file_name"],
                file_size=r["file_size"] or 0,
                chat_name=r.get("chat_name", "Unknown"),
                status=r["status"],
                priority=r["priority"] or 0,
                retry_count=r["retry_count"] or 0,
                max_retries=r["max_retries"] or 5,
                error=r.get("error"),
                progress=r.get("progress", 0.0) or 0.0,
                speed=r.get("speed", 0.0) or 0.0,
                started_at=r.get("started_at"),
                completed_at=r.get("completed_at"),
                created_at=r.get("created_at"),
            )
            for r in rows
        ]
    finally:
        await db.close()


@router.get("/queue/summary", response_model=QueueSummary)
async def get_queue_summary():
    from app.database.models import get_db
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

        return QueueSummary(
            pending=p["c"] if p else 0,
            downloading=dw["c"] if dw else 0,
            completed=c["c"] if c else 0,
            failed=f["c"] if f else 0,
            skipped=0,
            total=total,
            total_bytes=total_bytes,
            downloaded_bytes=downloaded_bytes,
            overall_progress=round(progress, 1),
        )
    finally:
        await db.close()


@router.post("/queue/pause/{job_id}")
async def pause_job(job_id: int):
    mgr = _get_manager()
    await mgr.pause_job(job_id)
    return {"ok": True}


@router.post("/queue/resume/{job_id}")
async def resume_job(job_id: int):
    mgr = _get_manager()
    await mgr.resume_job(job_id)
    import asyncio
    asyncio.create_task(mgr.process_queue())
    return {"ok": True}


@router.post("/queue/cancel/{job_id}")
async def cancel_job(job_id: int):
    mgr = _get_manager()
    await mgr.cancel_job(job_id)
    return {"ok": True}


@router.post("/queue/retry/{job_id}")
async def retry_job(job_id: int):
    mgr = _get_manager()
    await mgr.retry_job(job_id)
    import asyncio
    asyncio.create_task(mgr.process_queue())
    return {"ok": True}


@router.post("/queue/retry-all")
async def retry_all():
    mgr = _get_manager()
    count = await mgr.retry_all_failed()
    import asyncio
    asyncio.create_task(mgr.process_queue())
    return {"retried": count}


@router.post("/queue/clear-completed")
async def clear_completed():
    mgr = _get_manager()
    count = await mgr.clear_completed()
    return {"cleared": count}


@router.get("/settings", response_model=DownloadSettings)
async def get_download_settings():
    return DownloadSettings(
        max_concurrent=settings.MAX_CONCURRENT_DOWNLOADS,
        download_dir=str(settings.DOWNLOAD_DIRECTORY),
    )


@router.post("/settings")
async def update_download_settings(s: DownloadSettings):
    if s.max_concurrent > 0:
        settings.MAX_CONCURRENT_DOWNLOADS = s.max_concurrent
    if s.download_dir:
        p = Path(s.download_dir)
        p.mkdir(parents=True, exist_ok=True)
        settings.DOWNLOAD_DIRECTORY = p
    mgr = _get_manager()
    mgr.set_bandwidth_limit(s.bandwidth_limit_kbps)
    return {"ok": True}


@router.get("/stream/{chat_id}/{message_id}")
async def stream_download(chat_id: int, message_id: int):
    """Download a file from Telegram and stream it directly to the browser."""
    if not client_manager.is_connected or not client_manager.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated")

    client = client_manager.client
    if not client:
        raise HTTPException(status_code=401, detail="Client not available")

    msg = await client.get_messages(chat_id, ids=message_id)
    if not msg or not msg.media:
        raise HTTPException(status_code=404, detail="Message not found or has no media")

    # Determine filename
    file_name = f"document_{message_id}"
    doc = getattr(msg.media, 'document', None)
    if doc:
        for attr in getattr(doc, 'attributes', []):
            fn = getattr(attr, 'file_name', None)
            if fn:
                file_name = fn
                break

    # Download to temp file then stream
    ext = os.path.splitext(file_name)[1]
    fd, tmp = tempfile.mkstemp(suffix=ext)
    os.close(fd)
    try:
        downloaded = await client.download_media(msg, file=tmp)
        if not downloaded or not os.path.isfile(tmp) or os.path.getsize(tmp) == 0:
            raise HTTPException(status_code=500, detail="Failed to download media")

        def iter_file():
            with open(tmp, "rb") as f:
                while chunk := f.read(65536):
                    yield chunk

        return StreamingResponse(
            iter_file(),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
        )
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
