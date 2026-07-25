import { useEffect, useState, useCallback } from 'react'
import {
  Download,
  Pause,
  Play,
  X,
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  HardDrive,
  ChevronDown,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { api } from '../api/client'
import type { DownloadQueueItem, QueueSummary } from '../types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatSpeed(speed: number): string {
  if (speed === 0) return ''
  return formatBytes(speed) + '/s'
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <span className="badge-green"><CheckCircle className="w-3 h-3 mr-1" />Done</span>
    case 'downloading':
      return <span className="badge-blue"><Loader2 className="w-3 h-3 mr-1 animate-spin" />DL</span>
    case 'pending':
      return <span className="badge-gray"><Clock className="w-3 h-3 mr-1" />Pending</span>
    case 'paused':
      return <span className="badge-yellow"><Pause className="w-3 h-3 mr-1" />Paused</span>
    case 'failed':
      return <span className="badge-red"><AlertCircle className="w-3 h-3 mr-1" />Failed</span>
    case 'cancelled':
      return <span className="badge-gray">Cancelled</span>
    default:
      return <span className="badge-gray">{status}</span>
  }
}

export default function DownloadQueuePage() {
  const { queue, setQueue, queueSummary, setQueueSummary, addLog } = useAppStore()
  const [filter, setFilter] = useState<string>('all')

  const fetchQueue = useCallback(async () => {
    try {
      const [q, s] = await Promise.all([api.getQueue(), api.getQueueSummary()])
      setQueue(q)
      setQueueSummary(s)
    } catch {
      // ignore
    }
  }, [setQueue, setQueueSummary])

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 2000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  const handlePause = async (jobId: number) => {
    await api.pauseJob(jobId)
    addLog(`Paused job ${jobId}`)
    fetchQueue()
  }

  const handleResume = async (jobId: number) => {
    await api.resumeJob(jobId)
    await api.startQueue()
    addLog(`Resumed job ${jobId}`)
    fetchQueue()
  }

  const handleCancel = async (jobId: number) => {
    await api.cancelJob(jobId)
    addLog(`Cancelled job ${jobId}`)
    fetchQueue()
  }

  const handleRetry = async (jobId: number) => {
    await api.retryJob(jobId)
    await api.startQueue()
    addLog(`Retrying job ${jobId}`)
    fetchQueue()
  }

  const handleRetryAll = async () => {
    const result = await api.retryAllFailed()
    await api.startQueue()
    addLog(`Retrying ${result.retried} failed downloads`)
    fetchQueue()
  }

  const handleClearCompleted = async () => {
    const result = await api.clearCompleted()
    addLog(`Cleared ${result.cleared} completed items`)
    fetchQueue()
  }

  const filtered = filter === 'all' ? queue : queue.filter((item) => item.status === filter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Download Queue</h1>
        <p className="text-gray-500 mt-1">
          {queueSummary.total} total · {queueSummary.downloading} active ·{' '}
          {queueSummary.completed} completed · {queueSummary.failed} failed
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="card text-center">
          <p className="text-2xl font-bold text-white">{queueSummary.pending}</p>
          <p className="text-xs text-gray-500">Pending</p>
        </div>
        <div className="card text-center border-blue-700/30">
          <p className="text-2xl font-bold text-blue-400">{queueSummary.downloading}</p>
          <p className="text-xs text-gray-500">Downloading</p>
        </div>
        <div className="card text-center border-green-700/30">
          <p className="text-2xl font-bold text-green-400">{queueSummary.completed}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        <div className="card text-center border-red-700/30">
          <p className="text-2xl font-bold text-red-400">{queueSummary.failed}</p>
          <p className="text-xs text-gray-500">Failed</p>
        </div>
        <div className="card text-center">
          <p className="text-lg font-bold text-white">{formatBytes(queueSummary.total_bytes)}</p>
          <p className="text-xs text-gray-500">Total Size</p>
        </div>
      </div>

      {/* Overall progress */}
      {queueSummary.total > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Overall Progress</span>
            <span className="text-sm font-medium text-white">{queueSummary.overall_progress.toFixed(1)}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${queueSummary.overall_progress}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-600">
            <span>{formatBytes(queueSummary.downloaded_bytes)} downloaded</span>
            <span>{formatBytes(queueSummary.total_bytes - queueSummary.downloaded_bytes)} remaining</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="downloading">Downloading</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {queueSummary.failed > 0 && (
          <button className="btn-secondary" onClick={handleRetryAll}>
            <RefreshCw className="w-4 h-4" />
            Retry All Failed
          </button>
        )}
        {queueSummary.completed > 0 && (
          <button className="btn-ghost" onClick={handleClearCompleted}>
            <Trash2 className="w-4 h-4" />
            Clear Completed
          </button>
        )}
        <button className="btn-ghost" onClick={fetchQueue}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Queue items */}
      <div className="space-y-2">
        {filtered.map((item) => (
          <div key={item.id} className="card">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">{item.file_name}</span>
                  <StatusBadge status={item.status} />
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>{formatBytes(item.file_size)}</span>
                  <span>{item.chat_name}</span>
                  {item.retry_count > 0 && <span>Retry #{item.retry_count}</span>}
                  {item.error && <span className="text-red-400 truncate">Error: {item.error}</span>}
                </div>

                {/* Progress bar for downloading */}
                {(item.status === 'downloading' || item.status === 'paused') && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>{item.progress.toFixed(1)}%</span>
                      {item.speed > 0 && <span>{formatSpeed(item.speed)}</span>}
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1">
                {item.status === 'pending' && (
                  <button className="btn-ghost p-1.5" onClick={() => handlePause(item.id)} title="Pause">
                    <Pause className="w-4 h-4" />
                  </button>
                )}
                {item.status === 'downloading' && (
                  <button className="btn-ghost p-1.5" onClick={() => handlePause(item.id)} title="Pause">
                    <Pause className="w-4 h-4" />
                  </button>
                )}
                {item.status === 'paused' && (
                  <button className="btn-ghost p-1.5" onClick={() => handleResume(item.id)} title="Resume">
                    <Play className="w-4 h-4" />
                  </button>
                )}
                {item.status === 'failed' && (
                  <button className="btn-ghost p-1.5" onClick={() => handleRetry(item.id)} title="Retry">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
                {(item.status === 'pending' || item.status === 'paused' || item.status === 'downloading') && (
                  <button className="btn-ghost p-1.5" onClick={() => handleCancel(item.id)} title="Cancel">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Download className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">No items in queue. Select files from a chat to download.</p>
        </div>
      )}
    </div>
  )
}
