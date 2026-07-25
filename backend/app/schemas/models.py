from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AuthRequest(BaseModel):
    phone: str
    api_id: int
    api_hash: str


class OTPRequest(BaseModel):
    code: str
    password: Optional[str] = None


class AuthStatus(BaseModel):
    authenticated: bool = False
    phone: Optional[str] = None
    user_id: Optional[int] = None
    username: Optional[str] = None
    first_name: Optional[str] = None
    waiting_code: bool = False
    waiting_password: bool = False
    error: Optional[str] = None


class DialogOut(BaseModel):
    id: int
    peer_type: str
    peer_id: int
    name: str
    username: Optional[str] = None
    about: Optional[str] = None
    photo_path: Optional[str] = None
    member_count: int = 0
    unread_count: int = 0
    last_message_date: Optional[str] = None
    last_message: Optional[str] = None
    folder: str = ""
    document_count: int = 0
    total_size: int = 0


class DocumentOut(BaseModel):
    id: int
    chat_id: int
    message_id: int
    file_name: str = ""
    file_ext: str = ""
    mime_type: str = ""
    file_size: int = 0
    sender_name: str = ""
    message_date: Optional[str] = None
    downloaded: int = 0
    local_path: Optional[str] = None
    sha256: Optional[str] = None


class DownloadQueueOut(BaseModel):
    id: int
    document_id: int
    file_name: str = ""
    file_size: int = 0
    chat_name: str = ""
    status: str = "pending"
    priority: int = 0
    retry_count: int = 0
    max_retries: int = 5
    error: Optional[str] = None
    progress: float = 0.0
    speed: float = 0.0
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: Optional[str] = None


class HistoryOut(BaseModel):
    id: int
    chat_name: str
    chat_id: int
    file_name: str
    original_name: str = ""
    extension: str = ""
    file_size: int = 0
    sha256: Optional[str] = None
    message_id: int
    sender_name: str = ""
    message_date: Optional[str] = None
    download_date: Optional[str] = None
    local_path: str
    retry_count: int = 0
    status: str = "completed"
    message_link: Optional[str] = None


class ScanStatusOut(BaseModel):
    chat_id: int
    total_messages: int = 0
    scanned_messages: int = 0
    documents_found: int = 0
    status: str = "idle"
    last_message_id: Optional[int] = None
    error: Optional[str] = None


class DownloadRequest(BaseModel):
    document_ids: list[int]
    use_chat_subfolder: bool = True
    duplicate_action: str = "rename"
    skip_existing: bool = False


class DownloadSettings(BaseModel):
    max_concurrent: int = 5
    bandwidth_limit_kbps: int = 0
    retry_max: int = 5
    download_dir: str = ""
    use_chat_subfolder: bool = True
    duplicate_action: str = "rename"


class QueueSummary(BaseModel):
    pending: int = 0
    downloading: int = 0
    completed: int = 0
    failed: int = 0
    skipped: int = 0
    total: int = 0
    total_bytes: int = 0
    downloaded_bytes: int = 0
    overall_progress: float = 0.0
