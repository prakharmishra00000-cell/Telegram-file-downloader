import { useState, useEffect } from 'react'
import { Save, HardDrive, Sliders, Download, FolderOpen } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { api } from '../api/client'
import type { DownloadSettings } from '../types'

export default function SettingsPage() {
  const { settings, setSettings, addLog } = useAppStore()
  const [maxConcurrent, setMaxConcurrent] = useState(settings.max_concurrent)
  const [bandwidthLimit, setBandwidthLimit] = useState(settings.bandwidth_limit_kbps)
  const [downloadDir, setDownloadDir] = useState(settings.download_dir)
  const [useSubfolder, setUseSubfolder] = useState(settings.use_chat_subfolder)
  const [duplicateAction, setDuplicateAction] = useState(settings.duplicate_action)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const s = await api.getQueue() // TODO: separate endpoint
      } catch {
        // ignore
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const newSettings: DownloadSettings = {
        max_concurrent: maxConcurrent,
        bandwidth_limit_kbps: bandwidthLimit,
        retry_max: 5,
        download_dir: downloadDir,
        use_chat_subfolder: useSubfolder,
        duplicate_action: duplicateAction,
      }
      await api.updateDownloadSettings(newSettings)
      setSettings(newSettings)
      addLog('Settings saved')
    } catch (err: any) {
      addLog(`Failed to save settings: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-500 mt-1">Configure download behavior and application preferences</p>
      </div>

      {/* Download Settings */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Download className="w-5 h-5 text-accent-400" />
          Download Settings
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Max Concurrent Downloads
            </label>
            <input
              type="range"
              min={1}
              max={20}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(parseInt(e.target.value))}
              className="w-full"
            />
            <span className="text-sm text-gray-500">{maxConcurrent} files at once</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Bandwidth Limit (kbps, 0 = unlimited)
            </label>
            <input
              type="number"
              className="input"
              value={bandwidthLimit}
              onChange={(e) => setBandwidthLimit(parseInt(e.target.value) || 0)}
              min={0}
              placeholder="0 = unlimited"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Download Directory
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="input font-mono text-sm"
                value={downloadDir}
                onChange={(e) => setDownloadDir(e.target.value)}
                placeholder="Downloads"
              />
              <button className="btn-secondary" onClick={async () => {
                // Use electron API if available, otherwise prompt
                if ((window as any).electronAPI) {
                  const dir = await (window as any).electronAPI.selectDownloadDirectory()
                  if (dir) setDownloadDir(dir)
                } else {
                  const dir = prompt('Enter download directory path:')
                  if (dir) setDownloadDir(dir)
                }
              }}>
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useSubfolder}
                onChange={(e) => setUseSubfolder(e.target.checked)}
                className="rounded bg-dark-700 border-dark-500"
              />
              <span className="text-sm text-gray-300">Use chat-name subfolders</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              When file exists
            </label>
            <select
              className="input"
              value={duplicateAction}
              onChange={(e) => setDuplicateAction(e.target.value)}
            >
              <option value="rename">Rename (add number suffix)</option>
              <option value="skip">Skip</option>
              <option value="overwrite">Overwrite</option>
            </select>
          </div>
        </div>
      </div>

      {/* Environment Info */}
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Sliders className="w-5 h-5 text-accent-400" />
          Environment
        </h2>

        <div className="space-y-2 text-sm">
          {[
            ['API_ID', import.meta.env.VITE_API_ID || '(from environment)'],
            ['API_HASH', import.meta.env.VITE_API_HASH || '(from environment)'],
            ['SESSION_PATH', import.meta.env.VITE_SESSION_PATH || 'sessions/'],
            ['DOWNLOAD_DIRECTORY', import.meta.env.VITE_DOWNLOAD_DIR || 'downloads/'],
            ['DATABASE_PATH', import.meta.env.VITE_DATABASE_PATH || 'data/app.db'],
            ['LOG_LEVEL', import.meta.env.VITE_LOG_LEVEL || 'INFO'],
            ['MAX_CONCURRENT_DOWNLOADS', String(maxConcurrent)],
          ].map(([key, val]) => (
            <div key={key} className="flex items-center justify-between py-1">
              <span className="text-gray-400 font-mono text-xs">{key}</span>
              <span className="text-gray-500 font-mono text-xs truncate ml-4 max-w-[300px]">{val}</span>
            </div>
          ))}
        </div>
      </div>

      <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
