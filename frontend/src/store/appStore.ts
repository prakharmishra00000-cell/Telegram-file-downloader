import { create } from 'zustand'
import type { AuthStatus, Dialog, DownloadQueueItem, QueueSummary, HistoryItem, ScanStatus, DownloadSettings } from '../types'

interface AppState {
  // Auth
  auth: AuthStatus
  setAuth: (auth: AuthStatus) => void
  appToken: string
  setAppToken: (token: string) => void
  telegramAuthed: boolean
  setTelegramAuthed: (v: boolean) => void

  // Dialogs
  dialogs: Dialog[]
  setDialogs: (dialogs: Dialog[]) => void
  selectedDialog: Dialog | null
  setSelectedDialog: (dialog: Dialog | null) => void

  // Search
  searchQuery: string
  setSearchQuery: (q: string) => void

  // Queue
  queue: DownloadQueueItem[]
  setQueue: (queue: DownloadQueueItem[]) => void
  queueSummary: QueueSummary
  setQueueSummary: (summary: QueueSummary) => void

  // History
  history: HistoryItem[]
  setHistory: (history: HistoryItem[]) => void

  // Scan
  scanStatus: ScanStatus | null
  setScanStatus: (status: ScanStatus | null) => void

  // Settings
  settings: DownloadSettings
  setSettings: (settings: DownloadSettings) => void

  // UI
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  activeTab: string
  setActiveTab: (tab: string) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  logs: string[]
  addLog: (msg: string) => void
}

const defaultQueueSummary: QueueSummary = {
  pending: 0,
  downloading: 0,
  completed: 0,
  failed: 0,
  skipped: 0,
  total: 0,
  total_bytes: 0,
  downloaded_bytes: 0,
  overall_progress: 0,
}

const defaultSettings: DownloadSettings = {
  max_concurrent: 5,
  bandwidth_limit_kbps: 0,
  retry_max: 5,
  download_dir: '',
  use_chat_subfolder: true,
  duplicate_action: 'rename',
}

export const useAppStore = create<AppState>((set) => ({
  auth: { authenticated: false },
  setAuth: (auth) => set({ auth }),
  appToken: '',
  setAppToken: (token) => set({ appToken: token }),
  telegramAuthed: false,
  setTelegramAuthed: (v) => set({ telegramAuthed: v }),

  dialogs: [],
  setDialogs: (dialogs) => set({ dialogs }),
  selectedDialog: null,
  setSelectedDialog: (dialog) => set({ selectedDialog: dialog }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  queue: [],
  setQueue: (queue) => set({ queue }),
  queueSummary: defaultQueueSummary,
  setQueueSummary: (summary) => set({ queueSummary: summary }),

  history: [],
  setHistory: (history) => set({ history }),

  scanStatus: null,
  setScanStatus: (status) => set({ scanStatus: status }),

  settings: defaultSettings,
  setSettings: (settings) => set({ settings }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  activeTab: 'chats',
  setActiveTab: (tab) => set({ activeTab: tab }),
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  logs: ['Application started'],
  addLog: (msg) =>
    set((state) => ({
      logs: [
        ...state.logs,
        `[${new Date().toLocaleTimeString()}] ${msg}`,
      ].slice(-200),
    })),
}))
