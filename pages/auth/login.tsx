import { useState } from 'react'
import { useSupabaseClient } from '@supabase/auth-helpers-react'
import { useRouter } from 'next/router'
import Link from 'next/link'

export default function LoginPage() {
  const supabase = useSupabaseClient()
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
    if (loginError) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    // Redirect admin to /admin, members to /dashboard
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
    router.push(profile?.role === 'admin' ? '/admin' : '/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📚</div>
          <h1 className="text-3xl font-bold text-white">Welcome Back</h1>
          <p className="text-slate-400 mt-2">Sign in to your grade portal</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email Address</label>
              <input className="input" type="email" placeholder="you@university.edu"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="Your password"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            {error && <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}

            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
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
