import { useState } from 'react'
import { HardDrive, AlertCircle, Loader2, UserPlus, LogIn } from 'lucide-react'

const API_BASE = '/api'

export default function AppLoginPage({ onLogin }: { onLogin: (token: string, telegramAuthed: boolean) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/user/login' : '/api/user/register'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Request failed')
        return
      }
      if (data.token) {
        onLogin(data.token, data.telegram_authed === true)
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-600 mb-4">
            <HardDrive className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Telegram Document Downloader</h1>
          <p className="text-gray-500 mt-1">Sign in to access the tool</p>
        </div>

        <div className="card">
          <div className="flex mb-4 bg-dark-800 rounded-lg p-1">
            <button
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${mode === 'login' ? 'bg-accent-600 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setMode('login')}
            >
              <LogIn className="w-4 h-4 inline mr-1" /> Sign In
            </button>
            <button
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${mode === 'register' ? 'bg-accent-600 text-white' : 'text-gray-400 hover:text-white'}`}
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
                placeholder="Choose a username"
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
                placeholder="At least 6 characters"
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

          <p className="text-xs text-gray-600 text-center mt-4">
            Your credentials are stored encrypted on this server and never shared.
          </p>
        </div>
      </div>
    </div>
  )
}
