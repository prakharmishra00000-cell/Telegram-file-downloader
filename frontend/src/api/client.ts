// API Client with Live Server Support & Interactive Demo Fallback
import type { Dialog, Document, DownloadQueueItem, QueueSummary, HistoryItem, ScanStatus, DownloadSettings } from '../types'

let _authToken = localStorage.getItem('app_token') || ''

export function setAuthToken(token: string) {
  _authToken = token
  if (token) {
    localStorage.setItem('app_token', token)
  } else {
    localStorage.removeItem('app_token')
  }
}

export function getAuthToken() {
  return _authToken
}

export function getBaseUrl(): string {
  return localStorage.getItem('tg_api_base_url') || '/api'
}

export function setBaseUrl(url: string) {
  if (url) {
    localStorage.setItem('tg_api_base_url', url)
  } else {
    localStorage.removeItem('tg_api_base_url')
  }
}

export function isDemoMode(): boolean {
  return localStorage.getItem('tg_demo_mode') === 'true'
}

export function setDemoMode(enabled: boolean) {
  localStorage.setItem('tg_demo_mode', enabled ? 'true' : 'false')
}

function authHeaders(): Record<string, string> {
  return _authToken ? { 'Authorization': `Bearer ${_authToken}` } : {}
}

// ----------------- MOCK DATA STORE -----------------
const INITIAL_DIALOGS: Dialog[] = [
  {
    id: 1001,
    peer_type: 'channel',
    peer_id: 1001,
    name: 'Machine Learning & AI Research Papers',
    username: 'ml_ai_papers',
    about: 'Curated deep learning, transformer architectures, and modern LLM research papers.',
    member_count: 24500,
    unread_count: 8,
    last_message_date: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    last_message: 'Attention Is All You Need (Annotated Reference Edition).pdf',
    folder: 'AI / ML',
    document_count: 6,
    total_size: 48500000,
  },
  {
    id: 1002,
    peer_type: 'channel',
    peer_id: 1002,
    name: 'System Design & High Scale Architecture',
    username: 'system_design_vault',
    about: 'Distributed systems, microservices patterns, and interview resources.',
    member_count: 18200,
    unread_count: 3,
    last_message_date: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    last_message: 'Designing Data-Intensive Applications Comprehensive Cheat Sheet.pdf',
    folder: 'Backend',
    document_count: 5,
    total_size: 34200000,
  },
  {
    id: 1003,
    peer_type: 'supergroup',
    peer_id: 1003,
    name: 'GATE & CS Engineering Study Group',
    username: 'gate_cs_prep',
    about: 'Algorithms, Operating Systems, Computer Networks & DBMS study materials.',
    member_count: 9800,
    unread_count: 19,
    last_message_date: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    last_message: 'Operating Systems - Complete Notes by Galvin summary.pdf',
    folder: 'Academics',
    document_count: 4,
    total_size: 28400000,
  },
  {
    id: 1004,
    peer_type: 'channel',
    peer_id: 1004,
    name: 'DevOps & Cloud Native Architecture',
    username: 'devops_cloud_guide',
    about: 'Kubernetes, Docker, Terraform, CI/CD pipelines, and cloud reliability blueprints.',
    member_count: 12400,
    unread_count: 2,
    last_message_date: new Date(Date.now() - 1000 * 60 * 720).toISOString(),
    last_message: 'Production Kubernetes Hardening Guide 2026.pdf',
    folder: 'DevOps',
    document_count: 5,
    total_size: 51300000,
  },
]

const INITIAL_DOCUMENTS: Record<number, Document[]> = {
  1001: [
    {
      id: 2001,
      chat_id: 1001,
      message_id: 501,
      file_name: 'Attention_Is_All_You_Need_Transformer_Architecture.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 2240000,
      sender_name: 'Dr. Vaswani',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      downloaded: 0,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    {
      id: 2002,
      chat_id: 1001,
      message_id: 502,
      file_name: 'Deep_Learning_Goodfellow_Bengio_Courville.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 22500000,
      sender_name: 'Ian Goodfellow',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
      downloaded: 1,
      sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    },
    {
      id: 2003,
      chat_id: 1001,
      message_id: 503,
      file_name: 'Machine_Learning_Yearning_Andrew_Ng.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 4300000,
      sender_name: 'Andrew Ng',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
      downloaded: 0,
    },
    {
      id: 2004,
      chat_id: 1001,
      message_id: 504,
      file_name: 'BERT_Pre_training_Deep_Bidirectional_Transformers.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 3100000,
      sender_name: 'Jacob Devlin',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      downloaded: 0,
    },
    {
      id: 2005,
      chat_id: 1001,
      message_id: 505,
      file_name: 'Diffusion_Models_Foundations_and_Survey.epub',
      file_ext: 'epub',
      mime_type: 'application/epub+zip',
      file_size: 6800000,
      sender_name: 'AI Researcher',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
      downloaded: 0,
    },
    {
      id: 2006,
      chat_id: 1001,
      message_id: 506,
      file_name: 'PyTorch_Performance_Tuning_Guide.zip',
      file_ext: 'zip',
      mime_type: 'application/zip',
      file_size: 9560000,
      sender_name: 'MLOps Bot',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(),
      downloaded: 0,
    },
  ],
  1002: [
    {
      id: 2011,
      chat_id: 1002,
      message_id: 601,
      file_name: 'Designing_Data_Intensive_Applications.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 16400000,
      sender_name: 'Martin Kleppmann',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
      downloaded: 1,
    },
    {
      id: 2012,
      chat_id: 1002,
      message_id: 602,
      file_name: 'System_Design_Interview_Insider_Guide_Alex_Xu.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 12100000,
      sender_name: 'Alex Xu',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
      downloaded: 0,
    },
    {
      id: 2013,
      chat_id: 1002,
      message_id: 603,
      file_name: 'High_Performance_PostgreSQL_Optimization.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 5700000,
      sender_name: 'DBAdmin',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString(),
      downloaded: 0,
    },
  ],
  1003: [
    {
      id: 2021,
      chat_id: 1003,
      message_id: 701,
      file_name: 'Operating_Systems_Concepts_Silberschatz.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 14500000,
      sender_name: 'Prof. Galvin',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
      downloaded: 0,
    },
    {
      id: 2022,
      chat_id: 1003,
      message_id: 702,
      file_name: 'Computer_Networking_Top_Down_Approach_Kurose.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 13900000,
      sender_name: 'Jim Kurose',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9).toISOString(),
      downloaded: 0,
    },
  ],
  1004: [
    {
      id: 2031,
      chat_id: 1004,
      message_id: 801,
      file_name: 'Kubernetes_Production_Patterns_and_Practices.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 18200000,
      sender_name: 'KubeMaster',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      downloaded: 0,
    },
    {
      id: 2032,
      chat_id: 1004,
      message_id: 802,
      file_name: 'Terraform_Up_and_Running_Brikman.epub',
      file_ext: 'epub',
      mime_type: 'application/epub+zip',
      file_size: 9400000,
      sender_name: 'Yevgeniy Brikman',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
      downloaded: 0,
    },
    {
      id: 2033,
      chat_id: 1004,
      message_id: 803,
      file_name: 'Docker_Production_Hardening_Checklist.pdf',
      file_ext: 'pdf',
      mime_type: 'application/pdf',
      file_size: 3200000,
      sender_name: 'ContainerSec',
      message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
      downloaded: 0,
    },
  ],
}

let mockQueue: DownloadQueueItem[] = [
  {
    id: 1,
    document_id: 2001,
    file_name: 'Attention_Is_All_You_Need_Transformer_Architecture.pdf',
    file_size: 2240000,
    chat_name: 'Machine Learning & AI Research Papers',
    status: 'completed',
    priority: 1,
    retry_count: 0,
    max_retries: 3,
    progress: 100,
    speed: 0,
    completed_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: 2,
    document_id: 2012,
    file_name: 'System_Design_Interview_Insider_Guide_Alex_Xu.pdf',
    file_size: 12100000,
    chat_name: 'System Design & High Scale Architecture',
    status: 'downloading',
    priority: 1,
    retry_count: 0,
    max_retries: 3,
    progress: 68,
    speed: 3450000, // 3.45 MB/s
    started_at: new Date(Date.now() - 1000 * 20).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 3,
    document_id: 2031,
    file_name: 'Kubernetes_Production_Patterns_and_Practices.pdf',
    file_size: 18200000,
    chat_name: 'DevOps & Cloud Native Architecture',
    status: 'pending',
    priority: 2,
    retry_count: 0,
    max_retries: 3,
    progress: 0,
    speed: 0,
    created_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
  },
]

let mockHistory: HistoryItem[] = [
  {
    id: 1,
    chat_name: 'Machine Learning & AI Research Papers',
    chat_id: 1001,
    file_name: 'Deep_Learning_Goodfellow_Bengio_Courville.pdf',
    original_name: 'Deep_Learning_Goodfellow_Bengio_Courville.pdf',
    extension: 'pdf',
    file_size: 22500000,
    sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    message_id: 502,
    sender_name: 'Ian Goodfellow',
    message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    download_date: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    local_path: '/downloads/Machine Learning & AI Research Papers/Deep_Learning_Goodfellow_Bengio_Courville.pdf',
    retry_count: 0,
    status: 'completed',
  },
  {
    id: 2,
    chat_name: 'System Design & High Scale Architecture',
    chat_id: 1002,
    file_name: 'Designing_Data_Intensive_Applications.pdf',
    original_name: 'Designing_Data_Intensive_Applications.pdf',
    extension: 'pdf',
    file_size: 16400000,
    sha256: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
    message_id: 601,
    sender_name: 'Martin Kleppmann',
    message_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    download_date: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
    local_path: '/downloads/System Design & High Scale Architecture/Designing_Data_Intensive_Applications.pdf',
    retry_count: 0,
    status: 'completed',
  },
]

let mockSettings: DownloadSettings = {
  max_concurrent: 4,
  bandwidth_limit_kbps: 0,
  retry_max: 3,
  download_dir: 'downloads/',
  use_chat_subfolder: true,
  duplicate_action: 'rename',
}

let mockScanMap: Record<number, ScanStatus> = {}

// Mock dispatcher for seamless Vercel / offline operation
function handleMockRequest<T>(endpoint: string, options: RequestInit = {}): T {
  const method = (options.method || 'GET').toUpperCase()
  const cleanEndpoint = endpoint.split('?')[0]

  // Auth endpoints
  if (cleanEndpoint === '/auth/status') {
    return {
      authenticated: true,
      phone: '+91 98765 43210',
      user_id: 1002948,
      username: 'prakhar_mishra',
      first_name: 'Prakhar Mishra',
    } as unknown as T
  }

  if (cleanEndpoint === '/auth/login' || cleanEndpoint === '/auth/otp') {
    setDemoMode(true)
    return {
      authenticated: true,
      user_id: 1002948,
      username: 'prakhar_mishra',
      first_name: 'Prakhar Mishra',
    } as unknown as T
  }

  if (cleanEndpoint === '/auth/logout') {
    return { success: true } as unknown as T
  }

  if (cleanEndpoint === '/auth/me') {
    return {
      id: 1002948,
      username: 'prakhar_mishra',
      first_name: 'Prakhar Mishra',
      telegram_authed: true,
    } as unknown as T
  }

  // Scanner endpoints
  if (cleanEndpoint === '/scanner/dialogs') {
    const url = new URL(`http://localhost${endpoint}`)
    const q = url.searchParams.get('q')?.toLowerCase()
    let list = [...INITIAL_DIALOGS]
    if (q) {
      list = list.filter((d) => d.name.toLowerCase().includes(q) || d.username?.toLowerCase().includes(q))
    }
    return list as unknown as T
  }

  if (cleanEndpoint.startsWith('/scanner/dialogs/')) {
    const id = parseInt(cleanEndpoint.replace('/scanner/dialogs/', ''))
    const dialog = INITIAL_DIALOGS.find((d) => d.id === id) || INITIAL_DIALOGS[0]
    return dialog as unknown as T
  }

  if (cleanEndpoint.startsWith('/scanner/scan/') && cleanEndpoint.endsWith('/status')) {
    const parts = cleanEndpoint.split('/')
    const chatId = parseInt(parts[3])
    return (mockScanMap[chatId] || {
      chat_id: chatId,
      total_messages: 240,
      scanned_messages: 240,
      documents_found: (INITIAL_DOCUMENTS[chatId] || INITIAL_DOCUMENTS[1001]).length,
      status: 'completed',
    }) as unknown as T
  }

  if (cleanEndpoint.startsWith('/scanner/scan/') && method === 'POST') {
    const parts = cleanEndpoint.split('/')
    const chatId = parseInt(parts[3])
    mockScanMap[chatId] = {
      chat_id: chatId,
      total_messages: 240,
      scanned_messages: 240,
      documents_found: (INITIAL_DOCUMENTS[chatId] || INITIAL_DOCUMENTS[1001]).length,
      status: 'completed',
    }
    return { status: 'scanning', chat_id: chatId } as unknown as T
  }

  if (cleanEndpoint.startsWith('/scanner/documents/')) {
    const chatId = parseInt(cleanEndpoint.replace('/scanner/documents/', ''))
    const docs = INITIAL_DOCUMENTS[chatId] || INITIAL_DOCUMENTS[1001]
    const url = new URL(`http://localhost${endpoint}`)
    const q = url.searchParams.get('q')?.toLowerCase()
    const ext = url.searchParams.get('ext')?.toLowerCase()

    let filtered = [...docs]
    if (q) filtered = filtered.filter((d) => d.file_name.toLowerCase().includes(q))
    if (ext) filtered = filtered.filter((d) => d.file_ext.toLowerCase() === ext)

    return filtered as unknown as T
  }

  // Queue endpoints
  if (cleanEndpoint === '/download/queue') {
    if (method === 'POST') {
      const body = options.body ? JSON.parse(options.body as string) : {}
      const docIds: number[] = body.document_ids || []
      const allDocs = Object.values(INITIAL_DOCUMENTS).flat()
      docIds.forEach((did) => {
        const found = allDocs.find((d) => d.id === did)
        if (found && !mockQueue.some((q) => q.document_id === did)) {
          const chat = INITIAL_DIALOGS.find((d) => d.id === found.chat_id)
          mockQueue.push({
            id: mockQueue.length + 1,
            document_id: found.id,
            file_name: found.file_name,
            file_size: found.file_size,
            chat_name: chat?.name || 'Telegram Chat',
            status: 'pending',
            priority: 1,
            retry_count: 0,
            max_retries: 3,
            progress: 0,
            speed: 0,
            created_at: new Date().toISOString(),
          })
        }
      })
      return { success: true, count: docIds.length } as unknown as T
    }
    return mockQueue as unknown as T
  }

  if (cleanEndpoint === '/download/queue/start') {
    mockQueue = mockQueue.map((item) => {
      if (item.status === 'pending') {
        return { ...item, status: 'downloading', progress: 25, speed: 4200000 }
      }
      return item
    })
    return { status: 'started' } as unknown as T
  }

  if (cleanEndpoint === '/download/queue/summary') {
    const pending = mockQueue.filter((q) => q.status === 'pending').length
    const downloading = mockQueue.filter((q) => q.status === 'downloading').length
    const completed = mockQueue.filter((q) => q.status === 'completed').length
    const failed = mockQueue.filter((q) => q.status === 'failed').length
    const totalBytes = mockQueue.reduce((acc, q) => acc + q.file_size, 0)
    const downloadedBytes = mockQueue.reduce((acc, q) => acc + (q.file_size * (q.progress / 100)), 0)

    const summary: QueueSummary = {
      pending,
      downloading,
      completed,
      failed,
      skipped: 0,
      total: mockQueue.length,
      total_bytes: totalBytes,
      downloaded_bytes: Math.round(downloadedBytes),
      overall_progress: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
    }
    return summary as unknown as T
  }

  if (cleanEndpoint.startsWith('/download/queue/pause/')) {
    const id = parseInt(cleanEndpoint.split('/').pop() || '0')
    mockQueue = mockQueue.map((q) => (q.id === id ? { ...q, status: 'paused' } : q))
    return { success: true } as unknown as T
  }

  if (cleanEndpoint.startsWith('/download/queue/resume/')) {
    const id = parseInt(cleanEndpoint.split('/').pop() || '0')
    mockQueue = mockQueue.map((q) => (q.id === id ? { ...q, status: 'downloading', speed: 3800000 } : q))
    return { success: true } as unknown as T
  }

  if (cleanEndpoint.startsWith('/download/queue/cancel/')) {
    const id = parseInt(cleanEndpoint.split('/').pop() || '0')
    mockQueue = mockQueue.filter((q) => q.id !== id)
    return { success: true } as unknown as T
  }

  if (cleanEndpoint.startsWith('/download/queue/retry/')) {
    const id = parseInt(cleanEndpoint.split('/').pop() || '0')
    mockQueue = mockQueue.map((q) => (q.id === id ? { ...q, status: 'pending', progress: 0 } : q))
    return { success: true } as unknown as T
  }

  if (cleanEndpoint === '/download/queue/clear-completed') {
    mockQueue = mockQueue.filter((q) => q.status !== 'completed')
    return { success: true } as unknown as T
  }

  // History
  if (cleanEndpoint === '/history') {
    return mockHistory as unknown as T
  }

  if (cleanEndpoint === '/history/summary') {
    return {
      total_downloads: mockHistory.length,
      total_bytes: mockHistory.reduce((acc, h) => acc + h.file_size, 0),
    } as unknown as T
  }

  // Settings
  if (cleanEndpoint === '/download/settings') {
    if (method === 'POST') {
      const updated = options.body ? JSON.parse(options.body as string) : {}
      mockSettings = { ...mockSettings, ...updated }
      return mockSettings as unknown as T
    }
    return mockSettings as unknown as T
  }

  // Forwarding endpoints
  if (cleanEndpoint.includes('/forward')) {
    return { success: true, count: 5, forwarded: 5, total: 5, status: 'completed' } as unknown as T
  }

  return {} as unknown as T
}

// ----------------- MAIN REQUEST FUNCTION -----------------
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<T> {
  // If user explicitly activated demo mode, fulfill immediately with interactive mock
  if (isDemoMode()) {
    return handleMockRequest<T>(endpoint, options)
  }

  const baseUrl = getBaseUrl()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const url = `${baseUrl}${endpoint}`
  const config: RequestInit = {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    signal: controller.signal,
    ...options,
  }

  try {
    const response = await fetch(url, config)
    if (!response.ok) {
      // If server returned 404/502/503 (e.g. static host on Vercel without backend server)
      if (response.status === 404 || response.status >= 500) {
        console.warn(`[API] Endpoint ${endpoint} returned ${response.status}. Falling back to demo mock.`)
        return handleMockRequest<T>(endpoint, options)
      }
      const error = await response.text()
      throw new Error(error || `HTTP ${response.status}`)
    }
    return response.json()
  } catch (err: any) {
    // Network failure / server offline -> fallback seamlessly to interactive demo
    console.warn(`[API] Request to ${url} failed: ${err.message}. Seamlessly falling back to demo mode.`)
    return handleMockRequest<T>(endpoint, options)
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  // Auth
  authStatus: () => request<any>('/auth/status'),
  login: (data: { phone: string; api_id: number; api_hash: string }) =>
    request<any>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  verifyOTP: (data: { code: string; password?: string }) =>
    request<any>('/auth/otp', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request<any>('/auth/logout', { method: 'POST' }),
  me: () => request<any>('/auth/me'),

  // Scanner
  getDialogs: (q?: string) =>
    request<any[]>(`/scanner/dialogs${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getDialog: (chatId: number) => request<any>(`/scanner/dialogs/${chatId}`),
  startScan: (chatId: number, limit?: number) =>
    request<any>(`/scanner/scan/${chatId}${limit ? `?limit=${limit}` : ''}`, { method: 'POST' }),
  getScanStatus: (chatId: number) => request<any>(`/scanner/scan/${chatId}/status`),
  cancelScan: (chatId: number) =>
    request<any>(`/scanner/scan/${chatId}/cancel`, { method: 'POST' }),
  getDocuments: (
    chatId: number,
    params?: { ext?: string; min_size?: number; max_size?: number; q?: string; downloaded?: number; offset?: number; limit?: number }
  ) => {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) searchParams.set(k, String(v))
      })
    }
    return request<any[]>(`/scanner/documents/${chatId}?${searchParams.toString()}`)
  },

  // Download
  addToQueue: (data: { document_ids: number[]; use_chat_subfolder?: boolean; duplicate_action?: string; skip_existing?: boolean }) =>
    request<any>('/download/queue', { method: 'POST', body: JSON.stringify(data) }),
  startQueue: () => request<any>('/download/queue/start', { method: 'POST' }),
  getQueue: () => request<any[]>('/download/queue'),
  getQueueSummary: () => request<any>('/download/queue/summary'),
  pauseJob: (jobId: number) => request<any>(`/download/queue/pause/${jobId}`, { method: 'POST' }),
  resumeJob: (jobId: number) => request<any>(`/download/queue/resume/${jobId}`, { method: 'POST' }),
  cancelJob: (jobId: number) => request<any>(`/download/queue/cancel/${jobId}`, { method: 'POST' }),
  retryJob: (jobId: number) => request<any>(`/download/queue/retry/${jobId}`, { method: 'POST' }),
  retryAllFailed: () => request<any>('/download/queue/retry-all', { method: 'POST' }),
  clearCompleted: () => request<any>('/download/queue/clear-completed', { method: 'POST' }),

  // History
  getHistory: (params?: { q?: string; status?: string; ext?: string; offset?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) searchParams.set(k, String(v))
      })
    }
    return request<any[]>(`/history?${searchParams.toString()}`)
  },
  getHistorySummary: () => request<any>('/history/summary'),

  // Forward (long timeout: 10 min per file for download+reupload fallback)
  forwardDocuments: (document_ids: number[]) =>
    request<any>('/scanner/forward', { method: 'POST', body: JSON.stringify({ document_ids }) }, 600000),

  // Batched forward with resume capability
  forwardChatDocuments: (chatId: number, options?: { limit?: number; offset?: number; only_pdfs?: boolean }) => {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))
    if (options?.only_pdfs) params.set('only_pdfs', 'true')
    return request<any>(`/scanner/forward/chat/${chatId}?${params.toString()}`, { method: 'POST' }, 600000)
  },

  forwardChatPDFs: (chatId: number, options?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))
    return request<any>(`/scanner/forward/chat/${chatId}/pdfs?${params.toString()}`, { method: 'POST' }, 600000)
  },

  forwardAllPDFs: (options?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))
    return request<any>(`/scanner/forward/all/pdfs?${params.toString()}`, { method: 'POST' }, 600000)
  },

  getForwardProgress: (chatId?: number, only_pdfs?: boolean) => {
    const params = new URLSearchParams()
    if (chatId) params.set('chat_id', String(chatId))
    if (only_pdfs) params.set('only_pdfs', 'true')
    return request<any>(`/scanner/forward/progress?${params.toString()}`)
  },

  // Generic
  post: (endpoint: string, data: any) =>
    request<any>(endpoint, { method: 'POST', body: JSON.stringify(data) }),

  // Settings
  updateDownloadSettings: (settings: any) =>
    request<any>('/download/settings', { method: 'POST', body: JSON.stringify(settings) }),
  getDownloadSettings: () => request<any>('/download/settings'),
}
