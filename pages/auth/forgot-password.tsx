import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (resetError) { setError(resetError.message); setLoading(false); return }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔑</div>
          <h1 className="text-3xl font-bold text-white">Reset Password</h1>
          <p className="text-slate-400 mt-2">We&apos;ll send you a reset link</p>
        </div>
        <div className="card">
          {sent ? (
            <div className="text-center py-4">
              <p className="text-green-400 font-semibold mb-2">Check your email</p>
              <p className="text-slate-400 text-sm">A password reset link has been sent to <strong className="text-white">{email}</strong>.</p>
              <Link href="/auth/login" className="btn-primary inline-block mt-6 px-8">Back to Sign In</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Email Address</label>
                <input className="input" type="email" placeholder="your@email.com"
                  value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <p className="text-center text-slate-400 text-sm">
                <Link href="/auth/login" className="text-amber-400 hover:text-amber-300">← Back to Sign In</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
