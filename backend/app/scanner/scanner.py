import asyncio
import logging
from typing import Callable, Optional

from telethon import TelegramClient
from telethon.tl.types import (
    Channel, Chat, User, Message, MessageMediaDocument, MessageMediaPhoto,
    MessageService, MessageMediaWebPage, Document, Photo,
)
from telethon.errors import FloodWaitError, RPCError

from app.database.models import get_db

logger = logging.getLogger(__name__)


class ChatScanner:
    def __init__(self, client: TelegramClient) -> None:
        self._client = client
        self._running = False
        self._cancel_event = asyncio.Event()
        self._progress_callback: Optional[Callable] = None

    def set_progress_callback(self, cb: Callable) -> None:
        self._progress_callback = cb

    async def get_dialogs(self) -> list[dict]:
        if not self._client:
            return []
        # Ensure client is connected
        if not self._client.is_connected():
            try:
                await self._client.connect()
            except Exception:
                logger.exception("Failed to connect client for get_dialogs")
                return []
        dialogs = []
        try:
            async for dialog in self._client.iter_dialogs():
                entity = dialog.entity
                peer_type = self._get_peer_type(entity)
                username = getattr(entity, "username", "") or ""
                about = getattr(entity, "about", "") or ""
                member_count = 0
                if hasattr(entity, "participants_count"):
                    member_count = entity.participants_count or 0
                elif hasattr(entity, "members_count"):
                    member_count = entity.members_count or 0
                last_msg = dialog.message
                last_msg_date = last_msg.date.isoformat() if last_msg and last_msg.date else ""
                last_msg_text = (last_msg.text or getattr(last_msg, 'message', '') or "") if last_msg else ""
                dialogs.append({
                    "id": dialog.id,
                    "peer_type": peer_type,
                    "peer_id": dialog.id,
                    "name": dialog.name or "Unknown",
                    "username": username,
                    "about": about,
                    "photo_path": "",
                    "member_count": member_count,
                    "unread_count": dialog.unread_count,
                    "last_message_date": last_msg_date,
                    "last_message": last_msg_text[:200],
                    "folder": "",
                    "document_count": 0,
                    "total_size": 0,
                })
        except FloodWaitError as e:
            logger.warning("Flood wait on dialog fetch: %ss", e.seconds)
            await asyncio.sleep(e.seconds)
        except Exception:
            logger.exception("Failed to fetch dialogs")
        return dialogs

    async def scan_chat(self, chat_id: int, limit: int = 0) -> list[dict]:
        self._running = True
        self._cancel_event.clear()
        documents = []
        total_scanned = 0
        total_docs = 0
        max_messages = limit or 10000000

        access_hash = None
        try:
            input_entity = await self._client.get_input_entity(chat_id)
            if hasattr(input_entity, 'access_hash'):
                access_hash = input_entity.access_hash
        except Exception:
            pass

        db = await get_db()
        try:
            if db.dialect == "postgres":
                await db.execute(
                    "INSERT INTO scan_progress (chat_id, total_messages, scanned_messages, documents_found, status) "
                    "VALUES (?, ?, 0, 0, 'scanning') "
                    "ON CONFLICT (chat_id) DO UPDATE SET total_messages=EXCLUDED.total_messages, scanned_messages=0, documents_found=0, status='scanning'",
                    chat_id, max_messages,
                )
            else:
                await db.execute(
                    "INSERT OR REPLACE INTO scan_progress (chat_id, total_messages, scanned_messages, documents_found, status) "
                    "VALUES (?, ?, 0, 0, 'scanning')",
                    chat_id, max_messages,
                )
            await db.commit()

            last_store_idx = 0
            async for msg in self._client.iter_messages(
                chat_id, limit=max_messages, wait_time=0.5,
            ):
                if not self._running or self._cancel_event.is_set():
                    break

                total_scanned += 1

                try:
                    doc_info = self._extract_file(msg, chat_id)
                    if doc_info:
                        doc_info["access_hash"] = access_hash
                        total_docs += 1
                        documents.append(doc_info)
                except Exception:
                    pass

                if total_scanned % 100 == 0 and total_scanned > 0:
                    try:
                        await db.execute(
                            "UPDATE scan_progress SET scanned_messages=?, documents_found=?, last_message_id=? WHERE chat_id=?",
                            total_scanned, total_docs, msg.id, chat_id,
                        )
                        new_docs = documents[last_store_idx:]
                        for doc in new_docs:
                            if db.dialect == "postgres":
                                await db.execute(
                                    """INSERT INTO documents
                                    (chat_id, message_id, file_name, file_ext, mime_type, file_size, file_reference, access_hash, sender_id, sender_name, message_date)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    ON CONFLICT (chat_id, message_id) DO NOTHING""",
                                    doc["chat_id"], doc["message_id"], doc["file_name"], doc["file_ext"],
                                    doc["mime_type"], doc["file_size"], doc.get("file_reference"),
                                    doc.get("access_hash"), doc.get("sender_id"), doc["sender_name"],
                                    doc["message_date"],
                                )
                            else:
                                await db.execute(
                                    """INSERT OR IGNORE INTO documents
                                    (chat_id, message_id, file_name, file_ext, mime_type, file_size, file_reference, access_hash, sender_id, sender_name, message_date)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                                    doc["chat_id"], doc["message_id"], doc["file_name"], doc["file_ext"],
                                    doc["mime_type"], doc["file_size"], doc.get("file_reference"),
                                    doc.get("access_hash"), doc.get("sender_id"), doc["sender_name"],
                                    doc["message_date"],
                                )
                        last_store_idx = len(documents)
                        await db.commit()
                    except Exception:
                        pass
                    if total_scanned % 5000 == 0:
                        logger.info("Scan %s: %s msgs, %s docs found", chat_id, total_scanned, total_docs)

            try:
                remaining = documents[last_store_idx:]
                for doc in remaining:
                    if db.dialect == "postgres":
                        await db.execute(
                            """INSERT INTO documents
                            (chat_id, message_id, file_name, file_ext, mime_type, file_size, file_reference, access_hash, sender_id, sender_name, message_date)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT (chat_id, message_id) DO NOTHING""",
                            doc["chat_id"], doc["message_id"], doc["file_name"], doc["file_ext"],
                            doc["mime_type"], doc["file_size"], doc.get("file_reference"),
                            doc.get("access_hash"), doc.get("sender_id"), doc["sender_name"],
                            doc["message_date"],
                        )
                    else:
                        await db.execute(
                            """INSERT OR IGNORE INTO documents
                            (chat_id, message_id, file_name, file_ext, mime_type, file_size, file_reference, access_hash, sender_id, sender_name, message_date)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            doc["chat_id"], doc["message_id"], doc["file_name"], doc["file_ext"],
                            doc["mime_type"], doc["file_size"], doc.get("file_reference"),
                            doc.get("access_hash"), doc.get("sender_id"), doc["sender_name"],
                            doc["message_date"],
                        )
                await db.commit()
            except Exception:
                pass

            if access_hash is not None:
                await db.execute(
                    "UPDATE documents SET access_hash=? WHERE chat_id=? AND access_hash IS NULL",
                    access_hash, chat_id,
                )

            status = "completed" if self._running and not self._cancel_event.is_set() else "cancelled"
            await db.execute(
                "UPDATE scan_progress SET status=?, scanned_messages=?, documents_found=? WHERE chat_id=?",
                status, total_scanned, total_docs, chat_id,
            )
            await db.commit()

            logger.info("Scan %s complete: %s msgs scanned, %s docs found",
                        chat_id, total_scanned, total_docs)

        except Exception as e:
            logger.exception("Fatal error scanning chat %s", chat_id)
            try:
                await db.execute(
                    "UPDATE scan_progress SET status='error', error=? WHERE chat_id=?",
                    str(e)[:500], chat_id,
                )
                await db.commit()
            except Exception:
                pass
        finally:
            await db.close()

        return documents

    def cancel_scan(self) -> None:
        self._running = False
        self._cancel_event.set()

    def _extract_file(self, msg: Message, chat_id: int) -> Optional[dict]:
        if not msg.media or isinstance(msg, MessageService):
            return None

        if isinstance(msg.media, MessageMediaDocument):
            return self._doc_from_media_document(msg, chat_id)

        if isinstance(msg.media, MessageMediaPhoto):
            return self._doc_from_photo(msg, chat_id)

        if isinstance(msg.media, MessageMediaWebPage):
            webpage = getattr(msg.media, 'webpage', None)
            if webpage:
                doc = getattr(webpage, 'document', None)
                if doc:
                    return self._build_document(msg, chat_id, doc)
                photo = getattr(webpage, 'photo', None)
                if photo:
                    return self._build_photo_doc(msg, chat_id, photo)

        doc = getattr(msg.media, 'document', None)
        if doc and hasattr(doc, 'size') and doc.size > 0:
            return self._build_document(msg, chat_id, doc)

        return None

    def _doc_from_media_document(self, msg: Message, chat_id: int) -> Optional[dict]:
        doc = getattr(msg.media, 'document', None)
        if not doc:
            return None
        return self._build_document(msg, chat_id, doc)

    def _doc_from_photo(self, msg: Message, chat_id: int) -> Optional[dict]:
        photo = getattr(msg.media, 'photo', None)
        if not photo:
            return None
        return self._build_photo_doc(msg, chat_id, photo)

    def _build_photo_doc(self, msg: Message, chat_id: int, photo: Photo) -> dict:
        file_size = 0
        mime = "image/jpeg"
        sizes = getattr(photo, 'sizes', [])
        if sizes:
            file_size = getattr(sizes[-1], 'size', 0)

        file_ref = getattr(photo, 'id', None)
        file_name = f"photo_{msg.id}.jpg"
        file_ext = "jpg"

        return {
            "chat_id": chat_id,
            "message_id": msg.id,
            "file_name": file_name,
            "file_ext": file_ext,
            "mime_type": mime,
            "file_size": file_size,
            "file_reference": str(file_ref) if file_ref else None,
            "sender_id": getattr(msg, 'sender_id', None),
            "sender_name": self._get_sender_name(msg),
            "message_date": msg.date.isoformat() if getattr(msg, 'date', None) else "",
        }

    def _build_document(self, msg: Message, chat_id: int, doc) -> dict:
        file_size = getattr(doc, 'size', 0) or 0
        mime = getattr(doc, 'mime_type', "") or ""
        file_ref = getattr(doc, 'id', None)

        file_name = ""
        attributes = getattr(doc, 'attributes', [])
        for attr in attributes:
            fn = getattr(attr, 'file_name', None)
            if fn:
                file_name = fn
                break

        if not file_name:
            for attr in attributes:
                attr_type = type(attr).__name__
                if 'VideoAttribute' in attr_type:
                    ext_map = {"video/mp4": "mp4", "video/x-matroska": "mkv", "video/quicktime": "mov", "video/x-msvideo": "avi"}
                    ext = ext_map.get(mime, "mp4")
                    file_name = f"video_{msg.id}.{ext}"
                    break
                elif 'AudioAttribute' in attr_type:
                    ext_map = {"audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/flac": "flac", "audio/opus": "ogg"}
                    ext = ext_map.get(mime, "ogg")
                    file_name = f"audio_{msg.id}.{ext}"
                    break

        if not file_name:
            ext_map = {
                "application/pdf": "pdf", "application/zip": "zip",
                "application/x-rar-compressed": "rar", "application/x-7z-compressed": "7z",
                "application/gzip": "gz", "application/x-tar": "tar",
                "application/x-bzip2": "bz2",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
                "application/msword": "doc", "application/vnd.ms-excel": "xls",
                "application/vnd.ms-powerpoint": "ppt",
                "text/plain": "txt", "text/csv": "csv", "application/json": "json",
                "application/xml": "xml", "text/html": "html",
                "application/epub+zip": "epub", "application/x-mobipocket-ebook": "mobi",
                "application/vnd.android.package-archive": "apk",
                "application/x-msdownload": "exe", "application/x-iso9660-image": "iso",
                "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
                "image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp",
                "video/mp4": "mp4", "video/x-matroska": "mkv", "video/quicktime": "mov",
                "video/x-msvideo": "avi", "video/webm": "webm",
                "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/flac": "flac",
                "audio/wav": "wav", "audio/aac": "aac", "audio/opus": "opus",
                "application/x-font-ttf": "ttf", "application/x-font-otf": "otf",
                "application/vnd.rar": "rar",
            }
            ext = ext_map.get(mime, mime.split("/")[-1].split("+")[0] if mime else "")
            file_name = f"file_{msg.id}.{ext}" if ext else f"file_{msg.id}"

        file_ext = ""
        if "." in file_name:
            file_ext = file_name.rsplit(".", 1)[-1].lower()
        elif mime:
            file_ext = mime.split("/")[-1].split("+")[0]

        return {
            "chat_id": chat_id,
            "message_id": msg.id,
            "file_name": file_name,
            "file_ext": file_ext,
            "mime_type": mime,
            "file_size": file_size,
            "file_reference": str(file_ref) if file_ref else None,
            "sender_id": getattr(msg, 'sender_id', None),
            "sender_name": self._get_sender_name(msg),
            "message_date": msg.date.isoformat() if getattr(msg, 'date', None) else "",
        }

    def _get_sender_name(self, msg: Message) -> str:
        sender_id = getattr(msg, 'sender_id', None)
        if not sender_id:
            return ""
        try:
            sender = getattr(msg, 'sender', None)
            if sender:
                fn = getattr(sender, 'first_name', "") or ""
                ln = getattr(sender, 'last_name', "") or ""
                name = f"{fn} {ln}".strip()
                if name:
                    return name
                return getattr(sender, 'username', "") or ""
            return str(sender_id)
        except Exception:
            return str(sender_id)

    def _get_peer_type(self, entity) -> str:
        if isinstance(entity, Channel):
            return "supergroup" if getattr(entity, "megagroup", False) else "channel"
        elif isinstance(entity, Chat):
            return "group"
        elif isinstance(entity, User):
            return "bot" if getattr(entity, "bot", False) else "user"
        return "unknown"
