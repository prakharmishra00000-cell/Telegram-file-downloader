import { useEffect, useRef } from 'react'
import { Terminal, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/appStore'

export default function LogsPage() {
  const { logs, addLog } = useAppStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleClear = () => {
    addLog('--- Logs cleared ---')
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Logs</h1>
          <p className="text-gray-500 mt-1">{logs.length} entries</p>
        </div>
        <button className="btn-ghost" onClick={handleClear}>
          <Trash2 className="w-4 h-4" />
          Clear
        </button>
      </div>

      <div className="flex-1 bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-dark-700 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-gray-500" />
          <span className="text-xs text-gray-500 font-mono">Application Logs</span>
        </div>
        <div className="p-3 overflow-y-auto h-[calc(100vh-280px)] font-mono text-xs">
          {logs.map((log, i) => (
            <div key={i} className="py-0.5 text-gray-400 hover:text-gray-300">
              {log}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
