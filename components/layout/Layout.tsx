import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import CardinalLogo from '@/components/CardinalLogo'

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
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14 gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <CardinalLogo size={28} />
            <span className="text-white font-semibold text-sm hidden xs:inline sm:inline">Grade Portal</span>
          </Link>
          <div className="flex items-center gap-3">
            {/* Nav links — hidden on mobile to keep nav slim */}
            <div className="hidden sm:flex items-center gap-3">
              {router.pathname === '/dashboard' ? (
                <span className="text-sm text-amber-400 font-semibold">Dashboard</span>
              ) : (
                <Link href="/dashboard" className="text-sm text-slate-300 hover:text-white transition-colors">Dashboard</Link>
              )}
              {router.pathname === '/profile' ? (
                <span className="text-sm text-amber-400 font-semibold">Profile</span>
              ) : (
                <Link href="/profile" className="text-sm text-slate-300 hover:text-white transition-colors">Profile</Link>
              )}
              <span className="text-slate-500 text-xs">{email}</span>
            </div>
            {/* Sign Out — always visible */}
            <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-red-400 transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        {title && <h1 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">{title}</h1>}
        {children}
      </main>
    </div>
  )
}
