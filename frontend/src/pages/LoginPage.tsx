import { useState } from 'react'
import { HardDrive, AlertCircle, CheckCircle, Loader2, ArrowLeft } from 'lucide-react'
import { api } from '../api/client'
import { useAppStore } from '../store/appStore'

interface Props {
  onLogin?: (status: any) => void
  onBack?: () => void
  initialStatus?: { waiting_code?: boolean; waiting_password?: boolean; phone?: string }
}

export default function LoginPage({ onLogin, onBack, initialStatus }: Props) {
  const { setAuth, addLog } = useAppStore()
  const [step, setStep] = useState<'credentials' | 'otp' | '2fa'>(
    initialStatus?.waiting_code ? 'otp' : initialStatus?.waiting_password ? '2fa' : 'credentials'
  )
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState(initialStatus?.phone || '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await api.login({
        phone: phone.startsWith('+') ? phone : `+${phone}`,
        api_id: parseInt(apiId),
        api_hash: apiHash,
      })

      if (result.authenticated) {
        setAuth(result)
        addLog('Authenticated successfully')
        onLogin?.(result)
      } else if (result.waiting_code) {
        setStep('otp')
        addLog('OTP code sent')
      } else if (result.waiting_password) {
        setStep('2fa')
        addLog('2FA password required')
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await api.verifyOTP({
        code,
        password: step === '2fa' ? password : undefined,
      })

      if (result.authenticated) {
        setAuth(result)
        addLog('Authenticated successfully')
        onLogin?.(result)
      } else if (result.waiting_password) {
        setStep('2fa')
        addLog('2FA password required')
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-600 mb-4">
            <HardDrive className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Telegram Document Downloader</h1>
          <p className="text-gray-500 mt-1">Authenticate with your Telegram account</p>
        </div>

        {/* Form */}
        <div className="card">
          {onBack && (
            <button onClick={onBack} className="btn-ghost text-xs mb-3">
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back to app login
            </button>
          )}
          {step === 'credentials' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">API ID</label>
                <input
                  type="text"
                  className="input font-mono text-sm"
                  placeholder="12345678"
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">API Hash</label>
                <input
                  type="text"
                  className="input font-mono text-sm"
                  placeholder="1a2b3c4d5e6f..."
                  value={apiHash}
                  onChange={(e) => setApiHash(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Phone Number</label>
                <input
                  type="tel"
                  className="input font-mono text-sm"
                  placeholder="+1234567890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
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
                    <Loader2 className="w-4 h-4 animate-spin" /> Connecting...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>

              <p className="text-xs text-gray-600 text-center">
                Your Telegram credentials are encrypted at rest on the server and never shared.
                Get API credentials from{' '}
                <a
                  href="https://my.telegram.org/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-400 hover:underline"
                >
                  my.telegram.org
                </a>
              </p>
            </form>
          )}

          {(step === 'otp' || step === '2fa') && (
            <form onSubmit={handleOTP} className="space-y-4">
              {step === 'otp' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    OTP Code
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Enter the code sent to your Telegram app
                  </p>
                  <input
                    type="text"
                    className="input font-mono text-lg text-center tracking-widest"
                    placeholder="12345"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </div>
              )}

              {step === '2fa' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    2FA Password
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Your account has two-factor authentication enabled
                  </p>
                  <input
                    type="password"
                    className="input"
                    placeholder="Enter your 2FA password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/30 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                  </span>
                ) : (
                  'Verify'
                )}
              </button>

              <button
                type="button"
                className="btn-ghost w-full text-sm"
                onClick={() => {
                  setStep('credentials')
                  setError('')
                }}
              >
                Back
              </button>
            </form>
          )}
        </div>

        {/* Security notice */}
        <div className="mt-6 flex items-start gap-2 text-xs text-gray-600">
          <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-500" />
          <p>
            Your credentials are encrypted at rest and only used to communicate with Telegram's API.
            Downloaded files are stored server-side in the configured download directory.
          </p>
        </div>
      </div>
    </div>
  )
}
