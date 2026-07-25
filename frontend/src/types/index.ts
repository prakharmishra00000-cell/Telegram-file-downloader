export interface AuthStatus {
  authenticated: boolean
  phone?: string
  user_id?: number
  username?: string
  first_name?: string
  waiting_code?: boolean
  waiting_password?: boolean
  error?: string
}

export interface AuthRequest {
  phone: string
  api_id: number
  api_hash: string
}

export interface OTPRequest {
  code: string
  password?: string
}

export interface Dialog {
  id: number
  peer_type: string
  peer_id: number
  name: string
  username?: string
  about?: string
  photo_path?: string
  member_count: number
  unread_count: number
  last_message_date?: string
  last_message?: string
  folder: string
  document_count: number
  total_size: number
}

export interface Document {
  id: number
  chat_id: number
  message_id: number
  file_name: string
  file_ext: string
  mime_type: string
  file_size: number
  sender_name: string
  message_date?: string
  downloaded: number
  local_path?: string
  sha256?: string
}

export interface DownloadQueueItem {
  id: number
  document_id: number
  file_name: string
  file_size: number
  chat_name: string
  status: string
  priority: number
  retry_count: number
  max_retries: number
  error?: string
  progress: number
  speed: number
  started_at?: string
  completed_at?: string
  created_at?: string
}

export interface QueueSummary {
  pending: number
  downloading: number
  completed: number
  failed: number
  skipped: number
  total: number
  total_bytes: number
  downloaded_bytes: number
  overall_progress: number
}

export interface HistoryItem {
  id: number
  chat_name: string
  chat_id: number
  file_name: string
  original_name: string
  extension: string
  file_size: number
  sha256?: string
  message_id: number
  sender_name: string
  message_date?: string
  download_date?: string
  local_path: string
  retry_count: number
  status: string
  message_link?: string
}

export interface ScanStatus {
  chat_id: number
  total_messages: number
  scanned_messages: number
  documents_found: number
  status: string
  last_message_id?: number
  error?: string
}

export interface DownloadSettings {
  max_concurrent: number
  bandwidth_limit_kbps: number
  retry_max: number
  download_dir: string
  use_chat_subfolder: boolean
  duplicate_action: string
}
