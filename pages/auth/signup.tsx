import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/router'
import Link from 'next/link'
import CardinalLogo from '@/components/CardinalLogo'

const CLASS_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior']

const MAJORS = [
  'Accounting',
  'Architecture',
  'Biochemistry',
  'Biology',
  'Biomedical Engineering',
  'Business Administration',
  'Chemical Engineering',
  'Chemistry',
  'Civil Engineering',
  'Communications',
  'Computer Engineering',
  'Computer Science',
  'Criminal Justice',
  'Economics',
  'Education',
  'Electrical Engineering',
  'English',
  'Environmental Science',
  'Finance',
  'Graphic Design',
  'History',
  'Hospitality Management',
  'Human Resources',
  'Industrial Engineering',
  'Information Technology',
  'International Business',
  'Kinesiology',
  'Liberal Arts',
  'Management Information Systems',
  'Marketing',
  'Mathematics',
  'Mechanical Engineering',
  'Nursing',
  'Nutrition & Dietetics',
  'Philosophy',
  'Physics',
  'Political Science',
  'Pre-Law',
  'Pre-Medicine',
  'Psychology',
  'Public Health',
  'Public Relations',
  'Real Estate',
  'Social Work',
  'Sociology',
  'Sports Management',
  'Statistics',
  'Supply Chain Management',
  'Theatre',
  'Undecided',
  'Other',
]

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '', class_year: 'Freshman', major: '', majorOther: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    if (form.password.length < 6) return setError('Password must be at least 6 characters.')
    if (!form.full_name.trim()) return setError('Please enter your full name.')

    setLoading(true)
    const { data, error: signupError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.full_name.trim(), class_year: form.class_year, major: form.major === 'Other' ? (form.majorOther.trim() || null) : (form.major || null) } },
    })

    if (signupError) { setError(signupError.message); setLoading(false); return }

    if (data.session) {
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: data.session.access_token, expiresIn: data.session.expires_in }),
      })
    }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <CardinalLogo size={64} />
          </div>
          <p className="text-red-500/70 text-[11px] font-semibold tracking-widest uppercase mb-1">University of Louisville</p>
          <h1 className="text-3xl font-bold text-white">Create Account</h1>
          <p className="text-slate-400 mt-2">Join your chapter&apos;s grade portal</p>
        </div>
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" type="text" placeholder="John Smith" value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Email Address</label>
              <input className="input" type="email" placeholder="Your .edu email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Class Year</label>
              <select className="input" value={form.class_year}
                onChange={e => setForm(f => ({ ...f, class_year: e.target.value }))}>
                {CLASS_YEARS.map(yr => <option key={yr}>{yr}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Major <span className="text-slate-500">(optional)</span></label>
              <select className="input" value={form.major}
                onChange={e => setForm(f => ({ ...f, major: e.target.value, majorOther: '' }))}>
                <option value="">— Select your major —</option>
                {MAJORS.map(m => <option key={m}>{m}</option>)}
              </select>
              {form.major === 'Other' && (
                <input className="input mt-2" type="text" placeholder="Enter your major"
                  value={form.majorOther} onChange={e => setForm(f => ({ ...f, majorOther: e.target.value }))} />
              )}
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="Min. 6 characters" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input className="input" type="password" placeholder="Repeat password" value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} required />
            </div>
            {error && <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
          <p className="text-center text-slate-400 text-sm mt-4">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-amber-400 hover:text-amber-300">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
