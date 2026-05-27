import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/router'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let resolved = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !resolved) {
        resolved = true
        setReady(true)
      }
    })
    const timeout = setTimeout(() => {
      if (!resolved) setError('Invalid or expired reset link. Please request a new one.')
    }, 4000)
    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return setError('Passwords do not match.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError(updateError.message); setLoading(false); return }
    setSuccess(true)
    setTimeout(() => router.push('/auth/login'), 3000)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-3xl font-bold text-white">Set New Password</h1>
        </div>
        <div className="card">
          {success ? (
            <div className="text-center py-4">
              <p className="text-green-400 font-semibold text-lg">Password updated!</p>
              <p className="text-slate-400 text-sm mt-2">Redirecting to sign in…</p>
            </div>
          ) : error && !ready ? (
            <div className="text-center py-4">
              <p className="text-red-400 mb-4">{error}</p>
              <Link href="/auth/forgot-password" className="btn-secondary px-6">Request a new link</Link>
            </div>
          ) : ready ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">New Password</label>
                <input className="input" type="password" placeholder="Min. 6 characters"
                  value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="label">Confirm New Password</label>
                <input className="input" type="password" placeholder="Repeat password"
                  value={confirm} onChange={e => setConfirm(e.target.value)} required />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
                {loading ? 'Updating…' : 'Set New Password'}
              </button>
            </form>
          ) : (
            <div className="text-center py-8">
              <div className="inline-block w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 mt-3 text-sm">Verifying reset link…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
