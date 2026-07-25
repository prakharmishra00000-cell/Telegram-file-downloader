import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  MessageSquare,
  Users,
  Hash,
  Download,
  HardDrive,
  Filter,
  Clock,
  FileText,
  Send,
  Loader2,
  RotateCcw,
  Pause,
  Play,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { api } from '../api/client'
import type { Dialog } from '../types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function PeerIcon({ type }: { type: string }) {
  switch (type) {
    case 'channel':
      return <Hash className="w-5 h-5" />
    case 'supergroup':
    case 'group':
      return <Users className="w-5 h-5" />
    default:
      return <MessageSquare className="w-5 h-5" />
  }
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const {
    dialogs,
    setDialogs,
    searchQuery,
    setSearchQuery,
    selectedDialog,
    setSelectedDialog,
    setIsLoading,
    addLog,
  } = useAppStore()
  const [filteredDialogs, setFilteredDialogs] = useState<Dialog[]>([])
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'docs' | 'size'>('date')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [forwardingPdfs, setForwardingPdfs] = useState(false)

  // Batched forward all PDFs state
  const [batchForwardAllPdfs, setBatchForwardAllPdfs] = useState(false)
  const [batchForwardProgress, setBatchForwardProgress] = useState<{
    forwarded: number
    total: number
    errors: string[]
    nextOffset: number | null
    remaining: number
    isComplete: boolean
  } | null>(null)
  const batchForwardAllRef = useRef(false)

  const fetchDialogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await api.getDialogs()
      setDialogs(result)
      addLog(`Found ${result.length} dialogs`)
    } catch (err: any) {
      addLog(`Failed to fetch dialogs: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [setDialogs, setIsLoading, addLog])

  const handleBatchForwardAllPdfs = async () => {
    if (batchForwardAllRef.current) return
    batchForwardAllRef.current = true
    setBatchForwardAllPdfs(true)
    setBatchForwardProgress({ forwarded: 0, total: 0, errors: [], nextOffset: 0, remaining: 0, isComplete: false })
    try {
      let offset = 0
      const limit = 100
      let totalForwarded = 0
      let allErrors: string[] = []
      let total = 0

      // First get total count
      const progress = await api.getForwardProgress(undefined, true) // only_pdfs = true
      total = progress.total
      setBatchForwardProgress(prev => prev ? { ...prev, total } : null)

      while (true) {
        const result = await api.forwardAllPDFs({ limit, offset })

        if (!result || result.forwarded === 0 && result.errors.length === 0) break

        totalForwarded += result.forwarded
        allErrors = [...allErrors, ...result.errors]

        setBatchForwardProgress({
          forwarded: totalForwarded,
          total,
          errors: allErrors,
          nextOffset: result.next_offset,
          remaining: result.remaining,
          isComplete: result.next_offset === null,
        })

        if (result.next_offset === null || result.remaining === 0) break
        offset = result.next_offset!

        // Small delay between batches to avoid rate limits
        await new Promise(r => setTimeout(r, 1000))
      }

      addLog(`Batch forward all PDFs complete: ${totalForwarded}/${total} PDFs forwarded to Saved Messages`)
      if (allErrors.length) addLog(`Errors: ${allErrors.slice(0, 5).join('; ')}`)
    } catch (err: any) {
      addLog(`Batch forward all PDFs failed: ${err.message}`)
    } finally {
      batchForwardAllRef.current = false
      setBatchForwardAllPdfs(false)
      // Keep progress visible for a bit
      setTimeout(() => setBatchForwardProgress(null), 10000)
    }
  }

  const handleBatchForwardAllPdfsResume = async () => {
    if (batchForwardAllRef.current || !batchForwardProgress?.nextOffset) return
    await handleBatchForwardAllPdfs() // will use offset from progress
  }

  useEffect(() => {
    fetchDialogs()
  }, [fetchDialogs])

  useEffect(() => {
    let result = [...dialogs]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.username && d.username.toLowerCase().includes(q)) ||
          (d.about && d.about.toLowerCase().includes(q))
      )
    }

    if (typeFilter !== 'all') {
      result = result.filter((d) => d.peer_type === typeFilter)
    }

    switch (sortBy) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'date':
        result.sort((a, b) => {
          if (!a.last_message_date) return 1
          if (!b.last_message_date) return -1
          return b.last_message_date.localeCompare(a.last_message_date)
        })
        break
      case 'docs':
        result.sort((a, b) => b.document_count - a.document_count)
        break
      case 'size':
        result.sort((a, b) => b.total_size - a.total_size)
        break
    }

    setFilteredDialogs(result)
  }, [dialogs, searchQuery, sortBy, typeFilter])

  const totalDocs = dialogs.reduce((sum, d) => sum + d.document_count, 0)
  const totalSize = dialogs.reduce((sum, d) => sum + d.total_size, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Chats</h1>
        <p className="text-gray-500 mt-1">
          {dialogs.length} chats · {totalDocs} documents · {formatBytes(totalSize)}
        </p>
      </div>

      {/* Batch forward progress bar */}
      {batchForwardProgress && (
        <div className="w-full bg-dark-800 border border-dark-600 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">
              {batchForwardProgress.isComplete ? 'Batch Forward Complete' : 'Batch Forwarding All PDFs...'}
            </span>
            {!batchForwardProgress.isComplete && batchForwardAllPdfs && (
              <Loader2 className="w-4 h-4 animate-spin text-accent-400" />
            )}
          </div>
          <div className="w-full bg-dark-700 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                batchForwardProgress.isComplete ? 'bg-green-500' : 'bg-accent-400'
              }`}
              style={{ width: `${batchForwardProgress.total > 0 ? (batchForwardProgress.forwarded / batchForwardProgress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
            <span>{batchForwardProgress.forwarded} / {batchForwardProgress.total} PDFs forwarded</span>
            <span>{batchForwardProgress.remaining} remaining</span>
          </div>
          {batchForwardProgress.errors.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-red-400 cursor-pointer">Errors ({batchForwardProgress.errors.length})</summary>
              <ul className="text-xs text-red-300 mt-1 max-h-32 overflow-auto">
                {batchForwardProgress.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          {batchForwardProgress.isComplete && batchForwardProgress.remaining > 0 && (
            <button
              className="btn-primary text-xs mt-2 w-full"
              onClick={handleBatchForwardAllPdfsResume}
              disabled={batchForwardAllPdfs}
            >
              <RotateCcw className="w-4 h-4" />
              Resume ({batchForwardProgress.remaining} remaining)
            </button>
          )}
        </div>
      )}

      {/* Search and filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            className="input pl-10"
            placeholder="Search chats by name, username, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="input w-auto"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="channel">Channels</option>
          <option value="supergroup">Supergroups</option>
          <option value="group">Groups</option>
          <option value="user">Users</option>
          <option value="bot">Bots</option>
        </select>

        <select
          className="input w-auto"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
        >
          <option value="date">Sort by Date</option>
          <option value="name">Sort by Name</option>
          <option value="docs">Sort by Documents</option>
          <option value="size">Sort by Size</option>
        </select>

        <button className="btn-secondary" onClick={fetchDialogs}>
          <Filter className="w-4 h-4" />
          Refresh
        </button>

        <button
          className="btn-secondary"
          onClick={handleBatchForwardAllPdfs}
          disabled={batchForwardAllPdfs}
        >
          {batchForwardAllPdfs ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Forward All PDFs
        </button>
      </div>

      {/* Dialogs grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filteredDialogs.map((dialog) => (
          <button
            key={dialog.id}
            onClick={() => {
              setSelectedDialog(dialog)
              navigate(`/chat/${dialog.id}`)
            }}
            className={`card text-left hover:bg-dark-700/50 transition-colors duration-150 ${
              selectedDialog?.id === dialog.id ? 'ring-2 ring-accent-500/50 border-accent-500/50' : ''
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-xl bg-dark-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {dialog.photo_path ? (
                  <img src={dialog.photo_path} alt="" className="w-full h-full object-cover" />
                ) : (
                  <PeerIcon type={dialog.peer_type} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white truncate">
                    {dialog.name}
                  </h3>
                  {dialog.username && (
                    <span className="text-xs text-gray-500 truncate">
                      @{dialog.username}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500 capitalize">{dialog.peer_type}</span>
                  {dialog.member_count > 0 && (
                    <>
                      <span className="text-gray-600">·</span>
                      <span className="text-xs text-gray-500">
                        <Users className="w-3 h-3 inline mr-1" />
                        {dialog.member_count.toLocaleString()}
                      </span>
                    </>
                  )}
                  {dialog.unread_count > 0 && (
                    <>
                      <span className="text-gray-600">·</span>
                      <span className="text-xs text-accent-400 font-medium">
                        {dialog.unread_count} new
                      </span>
                    </>
                  )}
                </div>

                {dialog.about && (
                  <p className="text-xs text-gray-600 mt-1 line-clamp-1">{dialog.about}</p>
                )}

                {dialog.last_message && (
                  <p className="text-xs text-gray-600 mt-1 truncate">{dialog.last_message}</p>
                )}
              </div>

              {/* Stats */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {dialog.last_message_date && (
                  <span className="text-xs text-gray-600">{formatDate(dialog.last_message_date)}</span>
                )}
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <FileText className="w-3 h-3" />
                  {dialog.document_count}
                </div>
                {dialog.total_size > 0 && (
                  <span className="text-xs text-gray-600">{formatBytes(dialog.total_size)}</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {filteredDialogs.length === 0 && (
        <div className="text-center py-12">
          <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">
            {searchQuery ? 'No chats match your search' : 'No chats found. Click Refresh to load.'}
          </p>
        </div>
      )}
    </div>
  )
}
