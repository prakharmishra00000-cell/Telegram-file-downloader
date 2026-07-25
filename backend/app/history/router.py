import csv
import io
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.database.models import get_db
from app.schemas.models import HistoryOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=list[HistoryOut])
async def get_history(
    q: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    ext: Optional[str] = Query(None),
    offset: int = Query(0),
    limit: int = Query(200),
):
    db = await get_db()
    try:
        query = "SELECT * FROM download_history WHERE 1=1"
        params = []

        if q:
            query += " AND (file_name LIKE ? OR chat_name LIKE ?)"
            params.extend([f"%{q}%", f"%{q}%"])
        if status:
            query += " AND status=?"
            params.append(status)
        if ext:
            query += " AND extension=?"
            params.append(ext.lower())

        query += " ORDER BY download_date DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = await db.fetchall(query, *params)
        return [
            HistoryOut(
                id=r["id"],
                chat_name=r["chat_name"],
                chat_id=r["chat_id"],
                file_name=r["file_name"],
                original_name=r["original_name"],
                extension=r["extension"],
                file_size=r["file_size"],
                sha256=r["sha256"],
                message_id=r["message_id"],
                sender_name=r["sender_name"],
                message_date=r["message_date"],
                download_date=r["download_date"],
                local_path=r["local_path"],
                retry_count=r["retry_count"],
                status=r["status"],
                message_link=r.get("message_link"),
            )
            for r in rows
        ]
    finally:
        await db.close()


@router.get("/summary")
async def get_history_summary():
    db = await get_db()
    try:
        total = await db.fetchone("SELECT COUNT(*) as c FROM download_history")
        total_size = await db.fetchone("SELECT COALESCE(SUM(file_size),0) as s FROM download_history")
        unique_chats = await db.fetchone("SELECT COUNT(DISTINCT chat_id) as c FROM download_history")
        by_ext_rows = await db.fetchall(
            "SELECT extension, COUNT(*) as c, SUM(file_size) as s FROM download_history GROUP BY extension ORDER BY c DESC LIMIT 20"
        )
        return {
            "total_downloads": total["c"] if total else 0,
            "total_bytes": total_size["s"] if total_size else 0,
            "unique_chats": unique_chats["c"] if unique_chats else 0,
            "by_extension": [{"ext": r["extension"], "count": r["c"], "size": r["s"]} for r in by_ext_rows],
        }
    finally:
        await db.close()


@router.get("/export/csv")
async def export_csv():
    db = await get_db()
    try:
        rows = await db.fetchall("SELECT * FROM download_history ORDER BY download_date DESC")

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "ID", "Chat Name", "Chat ID", "File Name", "Original Name", "Extension",
            "File Size", "SHA-256", "Message ID", "Sender", "Message Date",
            "Download Date", "Local Path", "Retry Count", "Status", "Message Link",
        ])
        for r in rows:
            writer.writerow([
                r["id"], r["chat_name"], r["chat_id"], r["file_name"], r["original_name"],
                r["extension"], r["file_size"], r["sha256"], r["message_id"],
                r["sender_name"], r["message_date"], r["download_date"], r["local_path"],
                r["retry_count"], r["status"], r.get("message_link", ""),
            ])

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=download_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"},
        )
    finally:
        await db.close()


@router.get("/export/json")
async def export_json():
    db = await get_db()
    try:
        rows = await db.fetchall("SELECT * FROM download_history ORDER BY download_date DESC")

        data = [
            {
                "id": r["id"],
                "chat_name": r["chat_name"],
                "chat_id": r["chat_id"],
                "file_name": r["file_name"],
                "original_name": r["original_name"],
                "extension": r["extension"],
                "file_size": r["file_size"],
                "sha256": r["sha256"],
                "message_id": r["message_id"],
                "sender_name": r["sender_name"],
                "message_date": r["message_date"],
                "download_date": r["download_date"],
                "local_path": r["local_path"],
                "retry_count": r["retry_count"],
                "status": r["status"],
                "message_link": r.get("message_link"),
            }
            for r in rows
        ]

        return StreamingResponse(
            iter([json.dumps(data, indent=2, default=str)]),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=download_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"},
        )
    finally:
        await db.close()


@router.get("/export/sqlite")
async def export_sqlite():
    db = await get_db()
    if db.dialect != "sqlite":
        return {"error": "Export not available: database is not SQLite"}

    import shutil
    import tempfile
    from pathlib import Path

    src = Path(settings.DATABASE_PATH)
    if not src.exists():
        return {"error": "Database not found"}

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    shutil.copy2(str(src), tmp.name)

    from fastapi.responses import FileResponse
    return FileResponse(
        tmp.name,
        media_type="application/octet-stream",
        filename=f"download_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db",
    )
