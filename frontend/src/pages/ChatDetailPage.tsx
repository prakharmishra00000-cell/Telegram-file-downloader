import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  Search,
  FileText,
  Filter,
  RefreshCw,
  Loader2,
  HardDrive,
  ChevronDown,
  X,
  CheckSquare,
  Square,
  Clock,
  User,
  Inbox,
  Send,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { api } from '../api/client'
import type { Dialog, Document, ScanStatus } from '../types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString()
}

const EXT_GROUPS: Record<string, string[]> = {
  documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'json', 'xml', 'md'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
  media: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mkv', 'avi', 'mov', 'mp3', 'flac', 'ogg', 'wav'],
  books: ['epub', 'mobi', 'pdf'],
  apps: ['apk', 'exe', 'msi', 'dmg', 'iso'],
  other: [],
}

export default function ChatDetailPage() {
  const { chatId } = useParams<{ chatId: string }>()
  const navigate = useNavigate()
  const { dialogs, addLog, setIsLoading } = useAppStore()

  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [extFilter, setExtFilter] = useState('')
  const [sizeMin, setSizeMin] = useState('')
  const [sizeMax, setSizeMax] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [forwarding, setForwarding] = useState(false)
  const [forwardProgress, setForwardProgress] = useState<string>('')
  const forwardingRef = useRef(false)
  const [showFilters, setShowFilters] = useState(false)
  const [selectAll, setSelectAll] = useState(false)

  // Batched forward state
  const [batchForwarding, setBatchForwarding] = useState(false)
  const [batchForwardProgress, setBatchForwardProgress] = useState<{
    forwarded: number
    total: number
    errors: string[]
    nextOffset: number | null
    remaining: number
    isComplete: boolean
    batchOffset: number
    batchSize: number
  } | null>(null)
  const batchForwardRef = useRef(false)

  const cid = parseInt(chatId || '0')
  const prevStatusRef = useRef<string>('')

  const [allLoaded, setAllLoaded] = useState(false)
  const docsRef = useRef<Document[]>([])
  const PAGE_SIZE = 2000

  const loadDocuments = useCallback(async (offset: number = 0) => {
    if (!cid) return
    setLoading(true)
    try {
      const params: any = { limit: PAGE_SIZE, offset }
      if (search) params.q = search
      if (extFilter) params.ext = extFilter
      if (sizeMin) params.min_size = parseInt(sizeMin) * 1024 * 1024
      if (sizeMax) params.max_size = parseInt(sizeMax) * 1024 * 1024

      const docs = await api.getDocuments(cid, params)
      if (offset > 0) {
        docsRef.current = [...docsRef.current, ...docs]
      } else {
        docsRef.current = docs
        setSelected(new Set())
        setSelectAll(false)
      }
      setDocuments([...docsRef.current])
      setAllLoaded(docs.length < PAGE_SIZE)
    } catch (err: any) {
      addLog(`Failed to load documents: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [cid, search, extFilter, sizeMin, sizeMax, addLog])

  const checkScanStatus = useCallback(async () => {
    try {
      const status = await api.getScanStatus(cid)
      setScanStatus(status)
      const isScanning = status.status === 'scanning'
      setScanning(isScanning)

      // Reload documents when scan completes (from any prior state)
      if (!isScanning && status.status === 'completed' && prevStatusRef.current !== 'completed') {
        addLog(`Scan complete: ${status.documents_found} documents found`)
        await loadDocuments()
        const d = dialogs.find((d) => d.id === cid)
        if (d) {
          d.document_count = status.documents_found
        }
      }
      prevStatusRef.current = status.status
    } catch {
      // ignore
    }
  }, [cid, addLog, loadDocuments, dialogs])

  useEffect(() => {
    const d = dialogs.find((d) => d.id === cid)
    if (d) setDialog(d)
    prevStatusRef.current = ''
    forwardingRef.current = false
    setForwarding(false)
    setForwardProgress('')
    loadDocuments()
    // Delay initial status check to let loadDocuments complete
    setTimeout(() => checkScanStatus(), 500)
  }, [cid, dialogs, loadDocuments, checkScanStatus])

  useEffect(() => {
    if (scanning) {
      const interval = setInterval(checkScanStatus, 2000)
      return () => clearInterval(interval)
    }
  }, [scanning, checkScanStatus])

  const handleScan = async () => {
    setScanning(true)
    try {
      await api.startScan(cid)
      addLog(`Started scanning chat: ${dialog?.name || cid}`)
      // Immediately check status — scan might already be done for small chats
      checkScanStatus()
    } catch (err: any) {
      addLog(`Scan failed: ${err.message}`)
      setScanning(false)
    }
  }

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelected(new Set())
      setSelectAll(false)
    } else {
      setSelected(new Set(documents.map((d) => d.id)))
      setSelectAll(true)
    }
  }

  const handleDownloadSelected = () => {
    if (selected.size === 0) return
    const docs = documents.filter((d) => selected.has(d.id))
    for (const doc of docs) {
      const a = document.createElement('a')
      a.href = `/api/download/stream/${doc.chat_id}/${doc.message_id}`
      a.download = doc.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
    addLog(`Downloading ${docs.length} files to your PC`)
    setSelected(new Set())
    setSelectAll(false)
  }

  const handleDownloadAllVisible = async () => {
    try {
      const result = await api.addToQueue({ document_ids: documents.map((d) => d.id) })
      await api.startQueue()
      addLog(`Added ${result.added} visible files to download queue`)
    } catch (err: any) {
      addLog(`Failed to add to queue: ${err.message}`)
    }
  }

  const handleDownloadAllInChat = async () => {
    try {
      const result = await api.post(`/download/queue/chat/${cid}`, {})
      await api.startQueue()
      addLog(`Added ${result.added} files (ENTIRE chat) to download queue`)
    } catch (err: any) {
      addLog(`Failed to queue chat: ${err.message}`)
    }
  }

  const doForward = async (label: string, fn: () => Promise<any>) => {
    if (forwardingRef.current) return
    forwardingRef.current = true
    setForwarding(true)
    setForwardProgress(label)
    try {
      const result = await fn()
      if (result?.forwarded != null) addLog(`Forwarded ${result.forwarded}/${result.total} files to Saved Messages`)
      if (result?.errors?.length) addLog(`Forward errors: ${result.errors.join('; ')}`)
      return result
    } catch (err: any) {
      addLog(`Failed to forward: ${err.message}`)
    } finally {
      forwardingRef.current = false
      setForwarding(false)
      setForwardProgress('')
    }
  }

  const handleForwardSelected = async () => {
    if (selected.size === 0) return
    const result = await doForward(`Forwarding ${selected.size} files (may take a minute per file)...`, () =>
      api.forwardDocuments(Array.from(selected))
    )
    if (result) { setSelected(new Set()); setSelectAll(false) }
  }

const handleForwardVisible = () =>
    doForward(`Forwarding ${documents.length} files (may take a minute per file)...`, () =>
      api.forwardDocuments(Array.from(documents.map((d) => d.id)))
    )

  const handleBatchForward = async (onlyPdfs: boolean = false) => {
    if (batchForwardRef.current) return
    batchForwardRef.current = true
    setBatchForwarding(true)
    // Initialize with empty progress until we get actual numbers
    setBatchForwardProgress({ 
      forwarded: 0, 
      total: 0, 
      errors: [], 
      nextOffset: 0, 
      remaining: 0, 
      isComplete: false,
      batchOffset: 0,
      batchSize: 0
    })
    try {
      let offset = 0
      const limit = 100
      let totalForwarded = 0
      let allErrors: string[] = []
      let total = 0

      // First get total count
      const progress = await api.getForwardProgress(cid, onlyPdfs)
      total = progress.total
      setBatchForwardProgress(prev => prev ? { 
        ...prev, 
        total,
        forwarded: offset  // Start at current offset
      } : null)

      while (true) {
        const result = onlyPdfs
          ? await api.forwardChatPDFs(cid, { limit, offset })
          : await api.forwardChatDocuments(cid, { limit, offset })

        if (!result || (result.forwarded === 0 && result.errors.length === 0)) break

        totalForwarded += result.forwarded
        allErrors = [...allErrors, ...result.errors]

        setBatchForwardProgress({
          forwarded: totalForwarded,
          total,
          errors: allErrors,
          nextOffset: result.next_offset,
          remaining: result.remaining,
          isComplete: result.next_offset === null,
          batchOffset: offset,
          batchSize: result.batch_size || result.forwarded,
        })

        if (result.next_offset === null || result.remaining === 0) break
        offset = result.next_offset!

        // Small delay between batches to avoid rate limits
        await new Promise(r => setTimeout(r, 1000))
      }

      addLog(`Batch forward complete: ${totalForwarded}/${total} files forwarded to Saved Messages`)
      if (allErrors.length) addLog(`Errors: ${allErrors.slice(0, 5).join('; ')}`)
      await loadDocuments() // Refresh to show forwarded status
    } catch (err: any) {
      addLog(`Batch forward failed: ${err.message}`)
    } finally {
      batchForwardRef.current = false
      setBatchForwarding(false)
      // Keep progress visible for a bit
      setTimeout(() => setBatchForwardProgress(null), 10000)
    }
  }

  const handleBatchForwardResume = async () => {
    if (batchForwardRef.current || !batchForwardProgress?.nextOffset) return
    await handleBatchForward(false) // will use offset from progress
  }

  const handleForwardAllInChat = () =>
    doForward(`Forwarding all ${scanStatus?.documents_found || documents.length} files...`, () =>
      api.post(`/scanner/forward/chat/${cid}`, {})
    )

  const handleForwardPDFsInChat = () =>
    doForward(`Forwarding PDFs from this chat...`, () =>
      api.post(`/scanner/forward/chat/${cid}/pdfs`, {})
    )

  const handleForwardSingle = (docId: number) =>
    doForward('Forwarding 1 file (may take a minute)...', () => api.forwardDocuments([docId]))

  const handleDownload = (chatId: number, messageId: number, fileName: string) => {
    const a = document.createElement('a')
    a.href = `/api/download/stream/${chatId}/${messageId}`
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const totalSize = documents.reduce((s, d) => s + d.file_size, 0)
  const downloadedCount = documents.filter((d) => d.downloaded).length

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/chats')} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{dialog?.name || 'Chat'}</h1>
          <p className="text-sm text-gray-500">
            {documents.length} documents · {formatBytes(totalSize)} ·{' '}
            {downloadedCount} downloaded
            {scanStatus && scanStatus.scanned_messages > 0 && (
              <> · Scanned {scanStatus.scanned_messages} messages</>
            )}
          </p>
        </div>

        {!scanning && scanStatus?.status !== 'completed' && (
          <button className="btn-primary" onClick={handleScan} disabled={loading}>
            <RefreshCw className="w-4 h-4" />
            Scan Chat
          </button>
        )}
        {scanning && (
          <div className="flex items-center gap-2 text-accent-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Scanning... ({scanStatus?.scanned_messages || 0} messages,{' '}
            {scanStatus?.documents_found || 0} docs)
          </div>
        )}
        {forwarding && (
          <div className="flex items-center gap-2 text-accent-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {forwardProgress}
          </div>
        )}
        </div>

        {/* Batch forward progress bar */}
        {batchForwardProgress && (
          <div className="w-full bg-dark-800 border border-dark-600 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">
                {batchForwardProgress.isComplete ? 'Batch Forward Complete' : 'Batch Forwarding...'}
              </span>
              {!batchForwardProgress.isComplete && batchForwarding && (
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
              <span>{batchForwardProgress.forwarded} / {batchForwardProgress.total} forwarded</span>
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
                onClick={handleBatchForwardResume}
                disabled={batchForwarding}
              >
                <RotateCcw className="w-4 h-4" />
                Resume ({batchForwardProgress.remaining} remaining)
              </button>
            )}
          </div>
        {batchForwardProgress && (
          <div className="w-full bg-dark-800 border border-dark-600 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">
                {batchForwardProgress.isComplete ? 'Batch Forward Complete' : `Batch Forwarding (PDFs: ${batchForwardProgress.total > 0 ? (batchForwardProgress.forwarded / batchForwardProgress.total) * 100 : 0}%)`}
              </span>
              {!batchForwardProgress.isComplete && batchForwarding && (
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
              <span>{batchForwardProgress.forwarded} / {batchForwardProgress.total} forwarded ({batchForwardProgress.total > 0 ? Math.round((batchForwardProgress.forwarded / batchForwardProgress.total) * 100) : 0}%)</span>
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
                onClick={handleBatchForwardResume}
                disabled={batchForwarding}
              >
                <RotateCcw className="w-4 h-4" />
                Resume ({batchForwardProgress.remaining} remaining)
              </button>
            )}
          </div>
        )}

        {documents.length > 0 && (
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={handleDownloadAllInChat}>
              <Download className="w-4 h-4" />
              Download All ({scanStatus?.documents_found || documents.length})
            </button>
<div className="relative group">
              <button className="btn-ghost p-2">
                <ChevronDown className="w-4 h-4" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-56 bg-dark-800 border border-dark-600 rounded-lg shadow-xl z-50 hidden group-hover:block">
                <button className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-dark-700 rounded-t-lg border-b border-dark-600" onClick={handleDownloadAllVisible}>
                  Download Visible ({documents.length})
                </button>
                <button className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-dark-700 rounded-b-lg" onClick={handleDownloadAllInChat}>
                  Download All in Chat ({scanStatus?.documents_found || documents.length})
                </button>
              </div>
            </div>
            <button className="btn-secondary" onClick={() => handleBatchForward(false)}>
              <Send className="w-4 h-4" />
              Forward All ({scanStatus?.documents_found || documents.length})
            </button>
<div className="relative group">
              <button className="btn-ghost p-2">
                <ChevronDown className="w-4 h-4" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-56 bg-dark-800 border border-dark-600 rounded-lg shadow-xl z-50 hidden group-hover:block">
                <button className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-dark-700 rounded-t-lg" onClick={handleForwardVisible}>
                  Forward Visible ({documents.length})
                </button>
                <button className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-dark-700" onClick={() => handleBatchForward(false)}>
                  Forward All in Chat ({scanStatus?.documents_found || documents.length})
                </button>
                <button className="w-full text-left px-4 py-2 text-sm text-green-400 hover:bg-dark-700 border-t border-dark-600 font-semibold" onClick={() => handleBatchForward(true)}>
                  <Play className="w-3 h-3 mr-1" />
                  Forward PDFs Only
                </button>
              </div>
</div>
          </div>
        )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            className="input pl-10"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="input w-auto"
          value={extFilter}
          onChange={(e) => setExtFilter(e.target.value)}
        >
          <option value="">All Types</option>
          <optgroup label="Documents">
            {EXT_GROUPS.documents.map((ext) => (
              <option key={ext} value={ext}>.{ext}</option>
            ))}
          </optgroup>
          <optgroup label="Archives">
            {EXT_GROUPS.archives.map((ext) => (
              <option key={ext} value={ext}>.{ext}</option>
            ))}
          </optgroup>
          <optgroup label="Media">
            {EXT_GROUPS.media.map((ext) => (
              <option key={ext} value={ext}>.{ext}</option>
            ))}
          </optgroup>
          <optgroup label="Books">
            {EXT_GROUPS.books.map((ext) => (
              <option key={ext} value={ext}>.{ext}</option>
            ))}
          </optgroup>
          <optgroup label="Apps">
            {EXT_GROUPS.apps.map((ext) => (
              <option key={ext} value={ext}>.{ext}</option>
            ))}
          </optgroup>
        </select>

        <button
          className="btn-ghost"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4" />
          Size
        </button>

        <button className="btn-ghost" onClick={() => loadDocuments(0)}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <div className="flex items-center gap-3 p-3 bg-dark-800 rounded-lg border border-dark-600">
          <span className="text-sm text-gray-400">Min size (MB):</span>
          <input
            type="number"
            className="input w-20"
            value={sizeMin}
            onChange={(e) => setSizeMin(e.target.value)}
            placeholder="0"
          />
          <span className="text-sm text-gray-400">Max size (MB):</span>
          <input
            type="number"
            className="input w-20"
            value={sizeMax}
            onChange={(e) => setSizeMax(e.target.value)}
            placeholder="1000"
          />
          <button className="btn-ghost text-xs" onClick={() => { setSizeMin(''); setSizeMax('') }}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Selection bar */}
          {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-accent-900/30 border border-accent-700/30 rounded-lg">
          <span className="text-sm text-accent-300">{selected.size} files selected</span>
          <button className="btn-primary text-xs" onClick={handleDownloadSelected}>
            <Download className="w-4 h-4" />
            Download Selected
          </button>
          <button className="btn-secondary text-xs" onClick={handleForwardSelected}>
            <Send className="w-4 h-4" />
            Forward Selected
          </button>
          <button className="btn-ghost text-xs" onClick={() => { setSelected(new Set()); setSelectAll(false) }}>
            <X className="w-4 h-4" />
            Clear
          </button>
        </div>
      )}

      {/* Document list */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1">
          {/* Header */}
          <div className="flex items-center gap-3 px-3 py-2 text-xs text-gray-500 font-medium">
            <button onClick={toggleSelectAll} className="p-1 hover:text-gray-300">
              {selectAll ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            </button>
            <span className="flex-1">File Name</span>
            <span className="w-16 text-right">Size</span>
            <span className="w-20">Extension</span>
            <span className="w-28">Date</span>
            <span className="w-28">Sender</span>
            <span className="w-16 text-center">Status</span>
          </div>

          {documents.map((doc) => (
            <div
              key={doc.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-dark-800/50 cursor-pointer transition-colors ${
                selected.has(doc.id) ? 'bg-accent-900/20 border border-accent-700/30' : ''
              }`}
              onClick={() => toggleSelect(doc.id)}
            >
              <button className="p-1 text-gray-500 hover:text-gray-300">
                {selected.has(doc.id) ? (
                  <CheckSquare className="w-4 h-4 text-accent-400" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="truncate">{doc.file_name}</span>
              </div>
              <span className="w-16 text-right text-gray-400 font-mono text-xs">
                {formatBytes(doc.file_size)}
              </span>
              <span className="w-20 text-gray-500 font-mono text-xs">.{doc.file_ext}</span>
              <span className="w-28 text-gray-500 text-xs">{formatDate(doc.message_date)}</span>
              <span className="w-28 text-gray-500 text-xs truncate">{doc.sender_name}</span>
              <span className="w-16 text-center">
                {doc.downloaded ? (
                  <span className="badge-green">Done</span>
                ) : (
                  <span className="badge-gray">Pending</span>
                )}
              </span>
              <button
                className="p-1 text-gray-500 hover:text-green-400 transition-colors"
                onClick={(e) => { e.stopPropagation(); handleDownload(doc.chat_id, doc.message_id, doc.file_name) }}
                title="Download to your PC"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                className="p-1 text-gray-500 hover:text-accent-400 transition-colors"
                onClick={(e) => { e.stopPropagation(); handleForwardSingle(doc.id) }}
                title="Forward to Saved Messages"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Load More */}
          {!allLoaded && documents.length > 0 && (
            <div className="text-center py-4">
              <button
                className="btn-secondary"
                onClick={() => loadDocuments(docsRef.current.length)}
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Load More ({documents.length} loaded)
              </button>
            </div>
          )}
        </div>

        {documents.length > 0 && (
          <div className="text-xs text-gray-600 text-center py-2">
            {documents.length} files · {formatBytes(totalSize)} total
            {!allLoaded ? ' · scroll down and click Load More' : ''}
          </div>
        )}

        {documents.length === 0 && !loading && (
          <div className="text-center py-16">
            <Inbox className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">
              {scanStatus?.status === 'completed'
                ? 'No documents found in this chat'
                : 'Click "Scan Chat" to discover documents'}
            </p>
          </div>
        )}

        {loading && (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-accent-400 mx-auto" />
          </div>
        )}
      </div>
    </div>
  )
}
