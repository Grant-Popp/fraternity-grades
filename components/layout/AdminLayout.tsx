import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useState } from 'react'

interface AdminLayoutProps {
  children: React.ReactNode
  title?: string
}

const navItems = [
  { href: '/admin',             label: 'Dashboard',   icon: '📊' },
  { href: '/admin/submissions', label: 'Submissions',  icon: '📋' },
  { href: '/admin/members',     label: 'Members',      icon: '👥' },
  { href: '/admin/semesters',   label: 'Semesters',    icon: '📅' },
  { href: '/admin/export',      label: 'Export Excel', icon: '📥' },
]

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/auth/login')
  }

  const Sidebar = () => (
    <aside className="w-56 bg-slate-800 border-r border-slate-700 flex flex-col min-h-screen">
      <div className="p-5 border-b border-slate-700">
        <p className="text-amber-500 font-bold text-base">📚 Grade Portal</p>
        <p className="text-xs text-slate-400 mt-1">Admin Panel</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => {
          const active = router.pathname === item.href
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active ? 'bg-amber-500 text-slate-900 font-semibold' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}>
              <span>{item.icon}</span>{item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-slate-700">
        <Link href="/dashboard" className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-700">
          ← Member View
        </Link>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-700 mt-1">
          🚪 Sign Out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-slate-800 border-b border-slate-700 px-4 md:px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-slate-400 hover:text-white p-1 rounded"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-white">{title ?? 'Admin'}</h1>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
