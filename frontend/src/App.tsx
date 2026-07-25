import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2, HardDrive } from 'lucide-react'
import { useAppStore } from './store/appStore'
import { api, setAuthToken } from './api/client'
import Layout from './components/Layout'
import AppLoginPage from './pages/AppLoginPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ChatDetailPage from './pages/ChatDetailPage'
import DownloadQueuePage from './pages/DownloadQueuePage'
import SettingsPage from './pages/SettingsPage'
import LogsPage from './pages/LogsPage'

function LoadingScreen({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-600 mb-4">
          <HardDrive className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Telegram Document Downloader</h1>
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{msg}</span>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const { auth, setAuth, addLog, setQueueSummary, appToken, setAppToken, setTelegramAuthed } = useAppStore()
  const [step, setStep] = useState<'loading' | 'app_login' | 'telegram_login' | 'app'>('loading')

  useEffect(() => {
    // Restore token from localStorage
    const saved = localStorage.getItem('app_token')
    if (saved) {
      setAuthToken(saved)
      setAppToken(saved)
    }
    initAuth(saved)
  }, [])

  const initAuth = async (token: string | null) => {
    if (!token) {
      setStep('app_login')
      return
    }

    // Check Telegram auth status
    try {
      const status = await api.authStatus()
      if (status.authenticated) {
        setAuth(status)
        setTelegramAuthed(true)
        addLog('Session restored')
        setStep('app')
      } else if (status.waiting_code || status.waiting_password) {
        setAuth({ authenticated: false, waiting_code: status.waiting_code, waiting_password: status.waiting_password, phone: status.phone })
        setTelegramAuthed(false)
        setStep('telegram_login')
      } else {
        setAuth({ authenticated: false })
        setTelegramAuthed(false)
        setStep('telegram_login')
      }
    } catch {
      setAuth({ authenticated: false })
      setTelegramAuthed(false)
      setStep('telegram_login')
    }
  }

  const handleAppLogin = (token: string, telegramAuthed: boolean) => {
    localStorage.setItem('app_token', token)
    setAuthToken(token)
    setAppToken(token)
    if (telegramAuthed) {
      // Already Telegram-authed — try to restore session and go to app
      initAuth(token)
    } else {
      // No Telegram auth yet — show Telegram login page
      setTelegramAuthed(false)
      setStep('telegram_login')
    }
  }

  const handleTelegramLogin = (status: any) => {
    setAuth(status)
    setTelegramAuthed(true)
    setStep('app')
    addLog('Authenticated successfully')
  }

  const handleLogout = () => {
    localStorage.removeItem('app_token')
    setAuthToken('')
    setAppToken('')
    setTelegramAuthed(false)
    setAuth({ authenticated: false })
    setStep('app_login')
  }

  if (step === 'loading') return <LoadingScreen msg="Starting..." />
  if (step === 'app_login') return <AppLoginPage onLogin={handleAppLogin} />
  if (step === 'telegram_login') return <LoginPage onLogin={handleTelegramLogin} onBack={handleLogout} initialStatus={auth.waiting_code || auth.waiting_password ? auth : undefined} />

  return (
    <Layout onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/chats" element={<DashboardPage />} />
        <Route path="/chat/:chatId" element={<ChatDetailPage />} />
        <Route path="/downloads" element={<DownloadQueuePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
