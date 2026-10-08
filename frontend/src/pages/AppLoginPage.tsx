import { useState } from 'react'
import { HardDrive, AlertCircle, Loader2, UserPlus, LogIn, Sparkles, Server, CheckCircle2 } from 'lucide-react'
import { setDemoMode, getBaseUrl, setBaseUrl } from '../api/client'

export default function AppLoginPage({ onLogin }: { onLogin: (token: string, telegramAuthed: boolean) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showServerConfig, setShowServerConfig] = useState(false)
  const [customServer, setCustomServer] = useState(getBaseUrl())
  const [serverSavedMsg, setServerSavedMsg] = useState('')

  const handleLaunchDemo = () => {
    setDemoMode(true)
    onLogin('demo_user_token_live', true)
  }

  const handleSaveServer = (e: React.FormEvent) => {
    e.preventDefault()
    setBaseUrl(customServer.trim())
    setServerSavedMsg('Server URL updated successfully!')
    setTimeout(() => setServerSavedMsg(''), 3000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const baseUrl = getBaseUrl()
      const endpoint = mode === 'login' ? `${baseUrl}/user/login` : `${baseUrl}/user/register`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        if (res.status === 404 || res.status >= 500) {
          // Fallback gracefully to demo mode if backend is not deployed on this domain
          console.warn('Backend unavailable, launching interactive demo mode.')
          setDemoMode(true)
          onLogin('demo_user_token_live', true)
          return
        }
        const data = await res.json().catch(() => ({}))
        setError(data.detail || `Request failed (${res.status})`)
        return
      }

      const data = await res.json()
      if (data.token) {
        setDemoMode(false)
        onLogin(data.token, data.telegram_authed === true)
      }
    } catch (err: any) {
      // If network fails (e.g. backend server is not running on localhost or Vercel static host)
      console.warn('Network error connecting to backend. Falling back to live interactive demo.', err)
      setDemoMode(true)
      onLogin('demo_user_token_live', true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-600 mb-4 shadow-lg shadow-accent-600/30">
            <HardDrive className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Telegram Document Downloader</h1>
          <p className="text-gray-400 mt-1 text-sm">
            High-speed document browser, channel indexer & bulk downloader
          </p>
        </div>

        <div className="card shadow-xl border border-dark-700">
          {/* Quick Demo Access Button */}
          <div className="mb-5 p-3.5 rounded-xl bg-gradient-to-r from-accent-600/20 via-blue-600/20 to-purple-600/20 border border-accent-500/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-accent-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Instant Showcase Access
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                Live Interactive
              </span>
            </div>
            <p className="text-xs text-gray-300 mb-3">
              Explore chat indexing, document filters, download queues and multi-channel scraping without needing Telegram credentials.
            </p>
            <button
              type="button"
              onClick={handleLaunchDemo}
              className="w-full py-2.5 px-4 bg-accent-600 hover:bg-accent-500 text-white font-medium text-sm rounded-lg transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-accent-500/25 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Launch Interactive Live Demo</span>
            </button>
          </div>

          <div className="relative flex py-2 items-center mb-4">
            <div className="flex-grow border-t border-dark-700"></div>
            <span className="flex-shrink mx-3 text-xs text-gray-500 uppercase">Or Sign In with Account</span>
            <div className="flex-grow border-t border-dark-700"></div>
          </div>

          <div className="flex mb-4 bg-dark-800 rounded-lg p-1">
            <button
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${mode === 'login' ? 'bg-accent-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setMode('login')}
            >
              <LogIn className="w-4 h-4 inline mr-1" /> Sign In
            </button>
            <button
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${mode === 'register' ? 'bg-accent-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setMode('register')}
            >
              <UserPlus className="w-4 h-4 inline mr-1" /> Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
              <input
                type="text"
                className="input"
                placeholder="Enter username (e.g. prakhar)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                type="password"
                className="input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/30 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Please wait...
                </span>
              ) : mode === 'login' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Backend Server Configuration Toggle */}
          <div className="mt-4 pt-3 border-t border-dark-800">
            <button
              type="button"
              onClick={() => setShowServerConfig(!showServerConfig)}
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 mx-auto"
            >
              <Server className="w-3.5 h-3.5" />
              {showServerConfig ? 'Hide Server Configuration' : 'Connect to Custom Backend Server'}
            </button>

            {showServerConfig && (
              <form onSubmit={handleSaveServer} className="mt-3 p-3 bg-dark-900 rounded-lg border border-dark-700 space-y-2">
                <label className="block text-xs font-medium text-gray-400">
                  Backend API URL (e.g. http://127.0.0.1:8899)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input text-xs py-1.5 flex-1"
                    placeholder="http://127.0.0.1:8899"
                    value={customServer}
                    onChange={(e) => setCustomServer(e.target.value)}
                  />
                  <button type="submit" className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap">
                    Save
                  </button>
                </div>
                {serverSavedMsg && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {serverSavedMsg}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
