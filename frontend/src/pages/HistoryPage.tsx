import { useEffect, useState, useCallback } from 'react'
import { Search, Download, FileText, FolderOpen, ExternalLink, Loader2 } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { api } from '../api/client'
import type { HistoryItem } from '../types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}

export default function HistoryPage() {
  const { history, setHistory, addLog } = useAppStore()
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getHistory({ q: search || undefined, limit: 500 })
      setHistory(data)
    } catch (err: any) {
      addLog(`Failed to load history: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [search, setHistory, addLog])

  useEffect(() => {
    fetchHistory()
  }, [])

  const handleExportCSV = () => {
    window.open('/api/history/export/csv', '_blank')
    addLog('Exporting history as CSV')
  }

  const handleExportJSON = () => {
    window.open('/api/history/export/json', '_blank')
    addLog('Exporting history as JSON')
  }

  const totalFiles = history.length
  const totalBytes = history.reduce((s, h) => s + h.file_size, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Download History</h1>
          <p className="text-gray-500 mt-1">
            {totalFiles} files · {formatBytes(totalBytes)} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={handleExportCSV}>
            Export CSV
          </button>
          <button className="btn-secondary" onClick={handleExportJSON}>
            Export JSON
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          className="input pl-10"
          placeholder="Search history..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchHistory()}
        />
      </div>

      <div className="space-y-2">
        {history.map((item) => (
          <div key={item.id} className="card">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">{item.file_name}</span>
                  <span className="text-xs text-gray-500">.{item.extension}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>{formatBytes(item.file_size)}</span>
                  <span>{item.chat_name}</span>
                  <span>{formatDate(item.download_date)}</span>
                  {item.sender_name && <span>by {item.sender_name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="btn-ghost p-1.5"
                  onClick={() => {
                    // Open containing folder
                    const path = item.local_path
                    const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
                    if (idx >= 0) {
                      window.open('file://' + path.substring(0, idx), '_blank')
                    }
                  }}
                  title="Open folder"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && history.length === 0 && (
        <div className="text-center py-16">
          <Download className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">No download history yet</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-accent-400 mx-auto" />
        </div>
      )}
    </div>
  )
}
