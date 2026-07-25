import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.auth.client import client_manager
from app.scanner.scanner import ChatScanner
from app.database.models import get_db
from app.schemas.models import DialogOut, DocumentOut, ScanStatusOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scanner", tags=["scanner"])

_scanner: Optional[ChatScanner] = None
_scanner_client_id: int = 0


def _get_scanner():
    global _scanner, _scanner_client_id
    if not client_manager.client:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # Recreate scanner if client has changed (re-auth, reconnect, etc.)
    current_client_id = id(client_manager.client)
    if _scanner is None or _scanner_client_id != current_client_id:
        _scanner = ChatScanner(client_manager.client)
        _scanner_client_id = current_client_id
    return _scanner


@router.get("/dialogs", response_model=list[DialogOut])
async def list_dialogs(q: Optional[str] = Query(None)):
    if not client_manager.is_connected or not client_manager.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Ensure client is connected before scanning
    if client_manager.client and not client_manager.client.is_connected():
        try:
            await client_manager.client.connect()
        except Exception:
            pass

    scanner = _get_scanner()
    dialogs = await scanner.get_dialogs()

    db = await get_db()
    try:
        for d in dialogs:
            row = await db.fetchone(
                "SELECT COUNT(*) as cnt, COALESCE(SUM(file_size), 0) as total FROM documents WHERE chat_id=?",
                d["id"],
            )
            if row:
                d["document_count"] = row["cnt"]
                d["total_size"] = row["total"]
    finally:
        await db.close()

    if q:
        ql = q.lower()
        filtered = []
        for d in dialogs:
            if (
                ql in d["name"].lower()
                or (d.get("username") and ql in d["username"].lower())
                or ql in d.get("about", "").lower()
            ):
                filtered.append(d)
        dialogs = filtered

    return dialogs


@router.get("/dialogs/{chat_id}", response_model=DialogOut)
async def get_dialog(chat_id: int):
    scanner = _get_scanner()
    dialogs = await scanner.get_dialogs()
    for d in dialogs:
        if d["id"] == chat_id:
            return d
    raise HTTPException(status_code=404, detail="Dialog not found")


@router.post("/scan/{chat_id}")
async def start_scan(chat_id: int, limit: int = Query(0)):
    scanner = _get_scanner()

    db = await get_db()
    try:
        row = await db.fetchone("SELECT status FROM scan_progress WHERE chat_id=?", chat_id)
        if row and row["status"] == "scanning":
            return {"message": "Scan already in progress", "scanning": True}
    finally:
        await db.close()

    import asyncio
    asyncio.create_task(scanner.scan_chat(chat_id, limit))

    return {"message": "Scan started", "scanning": True}


@router.get("/scan/{chat_id}/status", response_model=ScanStatusOut)
async def get_scan_status(chat_id: int):
    db = await get_db()
    try:
        row = await db.fetchone("SELECT * FROM scan_progress WHERE chat_id=?", chat_id)
        if row:
            return ScanStatusOut(
                chat_id=row["chat_id"],
                total_messages=row["total_messages"],
                scanned_messages=row["scanned_messages"],
                documents_found=row["documents_found"],
                status=row["status"],
                last_message_id=row["last_message_id"],
                error=row["error"],
            )
        return ScanStatusOut(chat_id=chat_id, status="not_started")
    finally:
        await db.close()


@router.post("/scan/{chat_id}/cancel")
async def cancel_scan(chat_id: int):
    scanner = _get_scanner()
    scanner.cancel_scan()
    return {"message": "Scan cancelled"}


@router.get("/documents/{chat_id}", response_model=list[DocumentOut])
async def list_documents(
    chat_id: int,
    ext: Optional[str] = Query(None),
    min_size: Optional[int] = Query(None),
    max_size: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    downloaded: Optional[int] = Query(None),
    offset: int = Query(0),
    limit: int = Query(200),
):
    db = await get_db()
    try:
        query = "SELECT * FROM documents WHERE chat_id=?"
        params = [chat_id]

        if ext:
            query += " AND file_ext=?"
            params.append(ext.lower())
        if min_size is not None:
            query += " AND file_size>=?"
            params.append(min_size)
        if max_size is not None:
            query += " AND file_size<=?"
            params.append(max_size)
        if downloaded is not None:
            query += " AND downloaded=?"
            params.append(downloaded)
        if q:
            query += " AND (file_name LIKE ? OR sender_name LIKE ?)"
            params.extend([f"%{q}%", f"%{q}%"])

        query += " ORDER BY message_date DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = await db.fetchall(query, *params)
        return [
            DocumentOut(
                id=r["id"],
                chat_id=r["chat_id"],
                message_id=r["message_id"],
                file_name=r["file_name"],
                file_ext=r["file_ext"],
                mime_type=r["mime_type"],
                file_size=r["file_size"],
                sender_name=r["sender_name"],
                message_date=r["message_date"],
                downloaded=r["downloaded"],
                local_path=r["local_path"],
                sha256=r["sha256"],
            )
            for r in rows
        ]
    finally:
        await db.close()
