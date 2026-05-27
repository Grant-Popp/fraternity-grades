import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface LayoutProps {
  children: React.ReactNode
  title?: string
}

export default function Layout({ children, title }: LayoutProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-amber-500 font-bold text-lg">📚 Grade Portal</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className={`text-sm ${router.pathname === '/dashboard' ? 'text-amber-400 font-semibold' : 'text-slate-300 hover:text-white'}`}>
              Dashboard
            </Link>
            <span className="text-slate-500 text-xs">{email}</span>
            <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-red-400 transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {title && <h1 className="text-2xl font-bold text-white mb-6">{title}</h1>}
        {children}
      </main>
    </div>
  )
}
