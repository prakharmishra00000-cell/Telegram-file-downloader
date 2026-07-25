const BASE_URL = '/api'

let _authToken = ''

export function setAuthToken(token: string) {
  _authToken = token
}

function authHeaders(): Record<string, string> {
  return _authToken ? { 'Authorization': `Bearer ${_authToken}` } : {}
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs = 30000
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const url = `${BASE_URL}${endpoint}`
  const config: RequestInit = {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    signal: controller.signal,
    ...options,
  }

  try {
    const response = await fetch(url, config)
    if (!response.ok) {
      const error = await response.text()
      throw new Error(error || `HTTP ${response.status}`)
    }
    return response.json()
  } finally {
    clearTimeout(timer)
  }
}

export function getAuthToken() {
  return _authToken
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
