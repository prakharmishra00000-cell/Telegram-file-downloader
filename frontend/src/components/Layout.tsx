import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  MessageSquare,
  Download,
  Settings,
  Terminal,
  LogOut,
  HardDrive,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { api } from '../api/client'

const navItems = [
  { path: '/chats', label: 'Chats', icon: MessageSquare },
  { path: '/downloads', label: 'Downloads', icon: Download },

  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/logs', label: 'Logs', icon: Terminal },
]

export default function Layout({ children, onLogout }: { children: React.ReactNode; onLogout?: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { auth, setAuth, queueSummary, addLog } = useAppStore()

  const handleLogout = async () => {
    try {
      await api.logout()
    } catch {
      // ignore
    }
    setAuth({ authenticated: false })
    addLog('Logged out')
    onLogout?.()
  }

  return (
    <div className="flex h-screen bg-dark-950">
      {/* Sidebar */}
      <aside className="w-64 bg-dark-900 border-r border-dark-700 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="p-4 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-600 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">TG Downloader</h1>
              <p className="text-xs text-gray-500">Document Downloader</p>
            </div>
          </div>
        </div>

        {/* User info */}
        <div className="px-4 py-3 border-b border-dark-700">
          <p className="text-xs text-gray-400">
            {auth.first_name || auth.phone || 'User'}
          </p>
          {auth.username && (
            <p className="text-xs text-gray-600">@{auth.username}</p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path)
            const Icon = item.icon
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={
                  isActive ? 'sidebar-link-active w-full text-left' : 'sidebar-link-inactive w-full text-left'
                }
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.path === '/downloads' && queueSummary.downloading > 0 && (
                  <span className="badge-yellow text-xs">{queueSummary.downloading}</span>
                )}
                {item.path === '/downloads' && queueSummary.failed > 0 && (
                  <span className="badge-red text-xs">{queueSummary.failed}</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-dark-700">
          <button
            onClick={handleLogout}
            className="sidebar-link-inactive w-full text-left"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </main>
    </div>
  )
}
