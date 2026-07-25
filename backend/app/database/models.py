import logging
from typing import Optional

from app.database.adapter import DatabaseAdapter

logger = logging.getLogger(__name__)

_SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dialogs (
    id INTEGER PRIMARY KEY,
    peer_type TEXT NOT NULL,
    peer_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    username TEXT,
    about TEXT DEFAULT '',
    photo_path TEXT,
    member_count INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,
    last_message_date TEXT,
    last_message TEXT,
    migrated_to_id INTEGER,
    folder TEXT DEFAULT '',
    UNIQUE(peer_type, peer_id)
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    file_name TEXT DEFAULT '',
    file_ext TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    file_reference BLOB,
    access_hash INTEGER,
    sender_id INTEGER,
    sender_name TEXT DEFAULT '',
    message_date TEXT,
    downloaded INTEGER DEFAULT 0,
    forwarded INTEGER DEFAULT 0,
    local_path TEXT,
    sha256 TEXT,
    UNIQUE(chat_id, message_id)
);

CREATE TABLE IF NOT EXISTS download_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    error TEXT,
    progress REAL DEFAULT 0.0,
    speed REAL DEFAULT 0.0,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE TABLE IF NOT EXISTS download_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_name TEXT NOT NULL,
    chat_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    extension TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    sha256 TEXT,
    message_id INTEGER,
    sender_name TEXT DEFAULT '',
    message_date TEXT,
    download_date TEXT DEFAULT CURRENT_TIMESTAMP,
    local_path TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    message_link TEXT
);

CREATE TABLE IF NOT EXISTS scan_progress (
    chat_id INTEGER PRIMARY KEY,
    total_messages INTEGER DEFAULT 0,
    scanned_messages INTEGER DEFAULT 0,
    documents_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'idle',
    last_message_id INTEGER,
    error TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    encrypted_api_id TEXT,
    encrypted_api_hash TEXT,
    encrypted_phone TEXT,
    telegram_authed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT
);
"""

_PG_SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dialogs (
    id SERIAL PRIMARY KEY,
    peer_type TEXT NOT NULL,
    peer_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    username TEXT,
    about TEXT DEFAULT '',
    photo_path TEXT,
    member_count INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,
    last_message_date TEXT,
    last_message TEXT,
    migrated_to_id INTEGER,
    folder TEXT DEFAULT '',
    UNIQUE(peer_type, peer_id)
);

CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    file_name TEXT DEFAULT '',
    file_ext TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    file_reference BYTEA,
    access_hash INTEGER,
    sender_id INTEGER,
    sender_name TEXT DEFAULT '',
    message_date TEXT,
    downloaded INTEGER DEFAULT 0,
    forwarded INTEGER DEFAULT 0,
    local_path TEXT,
    sha256 TEXT,
    UNIQUE(chat_id, message_id)
);

CREATE TABLE IF NOT EXISTS download_queue (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    error TEXT,
    progress REAL DEFAULT 0.0,
    speed REAL DEFAULT 0.0,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE TABLE IF NOT EXISTS download_history (
    id SERIAL PRIMARY KEY,
    chat_name TEXT NOT NULL,
    chat_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    extension TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    sha256 TEXT,
    message_id INTEGER,
    sender_name TEXT DEFAULT '',
    message_date TEXT,
    download_date TEXT DEFAULT CURRENT_TIMESTAMP,
    local_path TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    message_link TEXT
);

CREATE TABLE IF NOT EXISTS scan_progress (
    chat_id INTEGER PRIMARY KEY,
    total_messages INTEGER DEFAULT 0,
    scanned_messages INTEGER DEFAULT 0,
    documents_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'idle',
    last_message_id INTEGER,
    error TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    encrypted_api_id TEXT,
    encrypted_api_hash TEXT,
    encrypted_phone TEXT,
    telegram_authed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT
);
"""

async def get_db() -> DatabaseAdapter:
    db = DatabaseAdapter()
    await db.connect()
    return db


async def init_db() -> None:
    db = DatabaseAdapter()
    await db.connect()
    schema = _PG_SCHEMA if db.dialect == "postgres" else _SQLITE_SCHEMA
    await db.execute_script(schema)
    await db.close()
    logger.info("Database initialized (dialect=%s)", db.dialect)


async def get_setting(key: str) -> Optional[str]:
    db = await get_db()
    row = await db.fetchone("SELECT value FROM settings WHERE key=?", key)
    return row["value"] if row else None


async def set_setting(key: str, value: str) -> None:
    db = await get_db()
    sql: str
    if db.dialect == "postgres":
        sql = "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
    else:
        sql = "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
    await db.execute(sql, key, value)
    await db.commit()
