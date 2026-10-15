import { useState } from 'react'
import { HardDrive, AlertCircle, CheckCircle, Loader2, ArrowLeft, Sparkles, Bot, User } from 'lucide-react'
import { api, setDemoMode } from '../api/client'
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
  const [authMethod, setAuthMethod] = useState<'bot' | 'user'>('bot')
  const [botToken, setBotToken] = useState('')
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState(initialStatus?.phone || '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDemoBypass = () => {
    setDemoMode(true)
    const mockStatus = {
      authenticated: true,
      user_id: 1002948,
      username: 'prakhar_mishra',
      first_name: 'Prakhar Mishra',
      phone: '+91 98765 43210',
    }
    setAuth(mockStatus)
    addLog('Connected via Demo Telegram Account')
    onLogin?.(mockStatus)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const cleanBotToken = botToken.trim()
      const cleanApiId = apiId.trim()
      const cleanPhone = phone.trim()
      const cleanHash = apiHash.trim()

      // Auto-detect Bot Token from any field
      const isDirectBot = authMethod === 'bot' && cleanBotToken
      const isDetectedBot = /^\d+:[\w-]+$/.test(cleanHash) || /^\d+:[\w-]+$/.test(cleanApiId) || /^\d+:[\w-]+$/.test(cleanBotToken)

      let targetApiId = 2040
      let targetApiHash = cleanHash
      let targetPhone = cleanPhone ? (cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`) : ''

      if (isDirectBot || isDetectedBot) {
        targetApiId = 2040
        targetApiHash = isDirectBot ? cleanBotToken : (/^\d+:[\w-]+$/.test(cleanHash) ? cleanHash : cleanApiId)
        targetPhone = ''
      } else {
        const digitsOnly = cleanApiId.replace(/\D/g, '')
        const numId = parseInt(digitsOnly, 10)
        if (!isNaN(numId) && numId > 0 && numId <= 4294967295) {
          targetApiId = (numId | 0)
        } else {
          targetApiId = 2040
        }
        if (!targetApiHash) {
          targetApiHash = 'b18441a1ff607e10a989891a5462e627'
        }
      }

      const result = await api.login({
        phone: targetPhone,
        api_id: targetApiId,
        api_hash: targetApiHash,
      })

      if (result.authenticated) {
        setAuth(result)
        addLog(result.is_bot ? `Connected as Bot @${result.username}` : 'Authenticated successfully')
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

          {/* Quick Demo Bypass */}
          <div className="mb-4 p-3 rounded-lg bg-accent-600/10 border border-accent-500/20">
            <p className="text-xs text-gray-300 mb-2">
              Evaluating the project? Skip Telegram credentials and explore the full live interface:
            </p>
            <button
              type="button"
              onClick={handleDemoBypass}
              className="w-full py-2 px-3 bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Explore With Demo Account</span>
            </button>
          </div>

          {/* Authentication Method Tabs */}
          <div className="flex rounded-lg bg-dark-900/80 p-1 mb-5 border border-dark-800">
            <button
              type="button"
              onClick={() => { setAuthMethod('bot'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-all ${
                authMethod === 'bot'
                  ? 'bg-accent-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Telegram Bot Token (Instant)</span>
            </button>
            <button
              type="button"
              onClick={() => { setAuthMethod('user'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-all ${
                authMethod === 'user'
                  ? 'bg-accent-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>User Account (OTP)</span>
            </button>
          </div>

          {step === 'credentials' && (
            <form onSubmit={handleLogin} className="space-y-4">
              {authMethod === 'bot' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-200">
                      Telegram Bot Token
                    </label>
                    <span className="text-[11px] text-accent-400 font-medium">Zero OTP required</span>
                  </div>
                  <input
                    type="text"
                    className="input font-mono text-sm"
                    placeholder="e.g. 8612061157:AAFcIwSJHANkk8_w01SbsPEq4SgNwIRV87s"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    required
                    autoFocus
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                    Created via Telegram <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:underline">@BotFather</a>. Authenticates permanently without requiring phone numbers or SMS codes.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Phone Number <span className="text-xs text-red-400 font-normal">*</span>
                    </label>
                    <input
                      type="tel"
                      className="input font-mono text-sm"
                      placeholder="e.g. +919876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Include international country code.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Telegram API ID <span className="text-xs text-gray-500 font-normal">(Optional — defaults to official client)</span>
                    </label>
                    <input
                      type="text"
                      className="input font-mono text-sm"
                      placeholder="e.g. 2040"
                      value={apiId}
                      onChange={(e) => setApiId(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Telegram API Hash <span className="text-xs text-gray-500 font-normal">(Optional — defaults to official client)</span>
                    </label>
                    <input
                      type="text"
                      className="input font-mono text-sm"
                      placeholder="e.g. b18441a1ff607e10a989891a5462e627"
                      value={apiHash}
                      onChange={(e) => setApiHash(e.target.value)}
                    />
                  </div>
                </>
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
                    <Loader2 className="w-4 h-4 animate-spin" /> Connecting...
                  </span>
                ) : (
                  authMethod === 'bot' ? 'Connect Telegram Bot' : 'Send OTP Code'
                )}
              </button>

              <p className="text-xs text-gray-600 text-center">
                Your Telegram credentials are encrypted at rest on the server and never shared.
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
