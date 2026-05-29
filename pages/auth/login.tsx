import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/router'
import Link from 'next/link'
import CardinalLogo from '@/components/CardinalLogo'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) { setError(loginError.message); setLoading(false); return }

    // Run session cookie + profile fetch in parallel to save ~200ms
    const [, profileRes] = await Promise.all([
      fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: data.session!.access_token, expiresIn: data.session!.expires_in }),
      }),
      supabase.from('profiles').select('role').eq('id', data.user!.id).single(),
    ])

    router.push(profileRes.data?.role === 'admin' ? '/admin' : '/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <CardinalLogo size={64} />
          </div>
          <p className="text-red-500/70 text-[11px] font-semibold tracking-widest uppercase mb-1">University of Louisville</p>
          <h1 className="text-3xl font-bold text-white">Welcome Back</h1>
          <p className="text-slate-400 mt-2">Sign in to your grade portal</p>
        </div>
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email Address</label>
              <input className="input" type="email" placeholder="Your .edu email"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="Your password"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div className="text-right -mt-2">
              <Link href="/auth/forgot-password" className="text-slate-400 hover:text-amber-400 text-xs transition-colors">
                Forgot password?
              </Link>
            </div>
            {error && <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" className="btn-primary w-full py-3 flex items-center justify-center gap-2" disabled={loading}>
              {loading && (
                <span className="inline-block w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              )}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <p className="text-center text-slate-400 text-sm mt-4">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="text-amber-400 hover:text-amber-300">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
