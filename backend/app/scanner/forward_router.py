import logging
import os
import tempfile

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from telethon.errors import ChatAdminRequiredError, MessageIdInvalidError, RPCError
from telethon.tl.types import (
    DocumentAttributeFilename,
    InputPeerChannel,
    InputPeerChat,
    InputPeerUser,
)

from app.auth.client import client_manager
from app.database.models import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scanner", tags=["forward"])


class ForwardRequest(BaseModel):
    document_ids: list[int]


class ForwardBatchResponse(BaseModel):
    forwarded: int
    total: int
    errors: list[str]
    next_offset: int | None = None
    remaining: int = 0


async def _resolve_peer(client, chat_id: int, access_hash: int | None = None) -> InputPeerChannel | InputPeerChat | InputPeerUser:
    """Build InputPeer for a chat_id, using stored access_hash for channels."""
    if chat_id < -1000000000000 and chat_id < 0:
        channel_id = -chat_id - 1000000000000
        if access_hash:
            return InputPeerChannel(channel_id, access_hash)
        # Access hash unknown; try the entity cache
        try:
            entity = await client.get_input_entity(chat_id)
            return entity
        except Exception:
            return InputPeerChannel(channel_id, 0)
    if chat_id < 0:
        return InputPeerChat(-chat_id)
    return InputPeerUser(chat_id, access_hash or 0)


async def _forward_or_reupload(
    client, chat_id: int, message_id: int, access_hash: int | None = None,
    file_name: str = "",
) -> str | None:
    """Try forwarding a message; fall back to download+upload if chat is protected."""

    # --- Method 1: Try native forward ---
    peer = None
    if access_hash and chat_id < 0:
        channel_id = -chat_id - 1000000000000 if chat_id < -1000000000000 else -chat_id
        try:
            peer = InputPeerChannel(channel_id, access_hash)
        except Exception:
            peer = None

    try:
        await client.forward_messages("me", message_id, peer or chat_id)
        return None
    except RPCError as e:
        err_str = str(e).lower()
        if "protected" not in err_str:
            return str(e)

    # --- Method 2: Protected chat fallback: download media and re-upload ---
    peer = await _resolve_peer(client, chat_id, access_hash)
    msg = await client.get_messages(peer, ids=message_id)
    if not msg:
        return f"Message {message_id} not found"
    if not msg.media:
        return f"Message {message_id} has no media"

    base_name = file_name or f"forward_{message_id}"
    ext = os.path.splitext(base_name)[1] or ""
    fd, tmp = tempfile.mkstemp(suffix=ext)
    os.close(fd)
    try:
        downloaded = await client.download_media(msg, file=tmp)
        if not downloaded:
            return "Failed to download media"
        await client.send_file(
            "me", downloaded, force_document=True,
            attributes=[DocumentAttributeFilename(base_name)],
        )
        return None
    except Exception as e:
        return str(e)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


@router.post("/forward/chat/{chat_id}")
async def forward_all_chat_documents(
    chat_id: int,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    only_pdfs: bool = Query(False),
):
    """Forward documents from a chat in batches. Use offset to resume."""
    return await _forward_chat_docs(chat_id, limit=limit, offset=offset, only_pdfs=only_pdfs)


@router.post("/forward/chat/{chat_id}/pdfs")
async def forward_chat_pdfs(
    chat_id: int,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Forward only PDFs from a chat in batches. Use offset to resume."""
    return await _forward_chat_docs(chat_id, limit=limit, offset=offset, only_pdfs=True)


async def _forward_chat_docs(
    chat_id: int,
    limit: int = 100,
    offset: int = 0,
    only_pdfs: bool = False,
) -> dict:
    """Forward documents from a chat in batches with enhanced error handling."""
    if not client_manager.is_connected or not client_manager.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated")

    client = client_manager.client
    if not client:
        raise HTTPException(status_code=401, detail="Client not available")

    db = await get_db()
    try:
        # Count total documents to forward
        count_sql = "SELECT COUNT(*) as cnt FROM documents WHERE chat_id=?"
        params: list = [chat_id]
        if only_pdfs:
            count_sql += " AND (file_ext='pdf' OR file_name LIKE '%.pdf')"
        count_row = await db.fetchone(count_sql, *params)
        total = count_row["cnt"] if count_row else 0

        if total == 0:
            msg = "No PDFs found in this chat" if only_pdfs else "No documents found in this chat"
            return {"forwarded": 0, "total": 0, "errors": [msg], "next_offset": None, "remaining": 0}

        # Get batch of documents with proper ordering
        sql = "SELECT id, message_id, file_name, access_hash FROM documents WHERE chat_id=?"
        sql_params: list = [chat_id]
        if only_pdfs:
            sql += " AND (file_ext='pdf' OR file_name LIKE '%.pdf')"
        sql += " ORDER BY message_id ASC LIMIT ? OFFSET ?"
        sql_params.extend([limit, offset])
        rows = await db.fetchall(sql, *sql_params)

        logger.info(
            "Starting forward batch for chat %s: offset=%d, batch_size=%d, total=%d",
            chat_id, offset, len(rows), total,
        )

        batch_errors: list[str] = []
        successful_forwards = 0
        access_hash = rows[0]["access_hash"] if rows else None

        for r in rows:
            try:
                err = await _forward_or_reupload(client, chat_id, r["message_id"], access_hash, r["file_name"])
                if err:
                    batch_errors.append(f"msg {r['message_id']} ({r['file_name'][:40]}): {err}")
                    logger.error("Forward failed for chat %s, msg %s: %s", chat_id, r["message_id"], err)
                else:
                    successful_forwards += 1
                    await db.execute("UPDATE documents SET forwarded=1 WHERE id=?", r["id"])
            except Exception as batch_err:
                batch_err_msg = f"msg {r['message_id']} ({r['file_name'][:40]}): {str(batch_err)}"
                batch_errors.append(batch_err_msg)
                logger.error("Batch processing error for chat %s, msg %s: %s", chat_id, r["message_id"], batch_err)

        await db.commit()

        next_offset = offset + limit if offset + len(rows) < total else None
        remaining = max(0, total - (offset + len(rows)))

        return {
            "forwarded": successful_forwards,
            "total": total,
            "errors": batch_errors,
            "next_offset": next_offset,
            "remaining": remaining,
            "batch_offset": offset,
            "batch_size": len(rows),
        }
    finally:
        await db.close()


async def _mark_forwarded(doc_id: int) -> None:
    db = await get_db()
    try:
        await db.execute("UPDATE documents SET forwarded=1 WHERE id=?", doc_id)
        await db.commit()
    finally:
        await db.close()


@router.post("/forward/all/pdfs")
async def forward_all_pdfs(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    only_pdfs: bool = Query(True),
):
    """Forward all PDFs across all chats in batches. Use offset to resume."""
    if not client_manager.is_connected or not client_manager.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated")

    client = client_manager.client
    if not client:
        raise HTTPException(status_code=401, detail="Client not available")

    db = await get_db()
    try:
        if only_pdfs:
            count_sql = "SELECT COUNT(*) as cnt FROM documents WHERE file_ext='pdf' OR file_name LIKE '%.pdf'"
            count_row = await db.fetchone(count_sql)
        else:
            count_row = await db.fetchone("SELECT COUNT(*) as cnt FROM documents WHERE forwarded=0")
        total = count_row["cnt"] if count_row else 0

        if total == 0:
            msg = "No PDFs found in any chat" if only_pdfs else "No documents found in any chat"
            return {"forwarded": 0, "total": 0, "errors": [msg], "next_offset": None, "remaining": 0}

        if only_pdfs:
            rows = await db.fetchall(
                "SELECT id, chat_id, message_id, file_name, access_hash FROM documents "
                "WHERE file_ext='pdf' OR file_name LIKE '%.pdf' ORDER BY chat_id, message_id ASC LIMIT ? OFFSET ?",
                limit, offset,
            )
        else:
            rows = await db.fetchall(
                "SELECT id, chat_id, message_id, file_name, access_hash FROM documents "
                "WHERE forwarded=0 ORDER BY chat_id, message_id ASC LIMIT ? OFFSET ?",
                limit, offset,
            )
    finally:
        await db.close()

    if not rows:
        return {"forwarded": 0, "total": total, "errors": [], "next_offset": None, "remaining": 0}

    forwarded = 0
    errors: list[str] = []
    for r in rows:
        err = await _forward_or_reupload(client, r["chat_id"], r["message_id"], r["access_hash"], r["file_name"])
        if err:
            errors.append(f"doc {r['id']} ({r['file_name'][:40]}): {err}")
        else:
            forwarded += 1
            await _mark_forwarded(r["id"])

    next_offset = offset + len(rows) if offset + len(rows) < total else None
    remaining = max(0, total - (offset + len(rows)))

    return {"forwarded": forwarded, "total": total, "errors": errors, "next_offset": next_offset, "remaining": remaining}


@router.get("/forward/progress")
async def get_forward_progress(
    chat_id: int | None = Query(None),
    only_pdfs: bool = Query(False),
) -> dict:
    """Get count of documents pending forward (not yet forwarded)."""
    db = await get_db()
    try:
        sql = "SELECT COUNT(*) as cnt FROM documents WHERE forwarded=0"
        params: list = []
        if chat_id is not None:
            sql += " AND chat_id=?"
            params.append(chat_id)
        if only_pdfs:
            sql += " AND (file_ext='pdf' OR file_name LIKE '%.pdf')"
        row = await db.fetchone(sql, *params)
        pending = row["cnt"] if row else 0

        sql_total = "SELECT COUNT(*) as cnt FROM documents"
        params_total: list = []
        if chat_id is not None:
            sql_total += " WHERE chat_id=?"
            params_total.append(chat_id)
            if only_pdfs:
                sql_total += " AND (file_ext='pdf' OR file_name LIKE '%.pdf')"
        elif only_pdfs:
            sql_total += " WHERE (file_ext='pdf' OR file_name LIKE '%.pdf')"
        row_total = await db.fetchone(sql_total, *params_total)
        total = row_total["cnt"] if row_total else 0
    finally:
        await db.close()

    return {"pending": pending, "total": total, "completed": total - pending}


@router.post("/forward")
async def forward_documents(req: ForwardRequest):
    if not client_manager.is_connected or not client_manager.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not req.document_ids:
        raise HTTPException(status_code=400, detail="No document IDs provided")

    client = client_manager.client
    if not client:
        raise HTTPException(status_code=401, detail="Client not available")

    db = await get_db()
    try:
        placeholders = ",".join("?" for _ in req.document_ids)
        rows = await db.fetchall(
            f"SELECT id, chat_id, message_id, file_name, access_hash FROM documents WHERE id IN ({placeholders})",
            *req.document_ids,
        )
    finally:
        await db.close()

    if not rows:
        raise HTTPException(status_code=404, detail="No documents found")

    forwarded = 0
    errors: list[str] = []
    for r in rows:
        err = await _forward_or_reupload(client, r["chat_id"], r["message_id"], r["access_hash"], r["file_name"])
        if err:
            errors.append(f"doc {r['id']} ({r['file_name'][:40]}): {err}")
        else:
            forwarded += 1
            await _mark_forwarded(r["id"])

    return {"forwarded": forwarded, "total": len(req.document_ids), "errors": errors}