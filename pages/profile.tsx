import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'
import type { Profile } from '@/lib/database.types'
import Layout from '@/components/layout/Layout'
import { gpaColorClass } from '@/lib/gpa'
import { useState } from 'react'

const CLASS_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior']

const MAJORS = [
  'Accounting', 'Architecture', 'Biochemistry', 'Biology', 'Biomedical Engineering',
  'Business Administration', 'Chemical Engineering', 'Chemistry', 'Civil Engineering',
  'Communications', 'Computer Engineering', 'Computer Science', 'Criminal Justice',
  'Economics', 'Education', 'Electrical Engineering', 'English', 'Environmental Science',
  'Finance', 'Graphic Design', 'History', 'Hospitality Management', 'Human Resources',
  'Industrial Engineering', 'Information Technology', 'International Business', 'Kinesiology',
  'Liberal Arts', 'Management Information Systems', 'Marketing', 'Mathematics',
  'Mechanical Engineering', 'Nursing', 'Nutrition & Dietetics', 'Philosophy', 'Physics',
  'Political Science', 'Pre-Law', 'Pre-Medicine', 'Psychology', 'Public Health',
  'Public Relations', 'Real Estate', 'Social Work', 'Sociology', 'Sports Management',
  'Statistics', 'Supply Chain Management', 'Theatre', 'Undecided', 'Other',
]

interface HistoryEntry {
  semesterName: string
  gpa: number | null
  status: string
  submittedAt: string
  adminNotes: string | null
}

interface Props {
  profile: Profile
  history: HistoryEntry[]
}

export default function ProfilePage({ profile, history }: Props) {
  const [form, setForm] = useState({
    full_name: profile.full_name,
    class_year: profile.class_year as string,
    major: MAJORS.includes(profile.major ?? '') ? (profile.major ?? '') : profile.major ? 'Other' : '',
    majorOther: MAJORS.includes(profile.major ?? '') ? '' : (profile.major ?? ''),
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    setSaved(false)
    const res = await fetch('/api/members/update-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: form.full_name,
        class_year: form.class_year,
        major: form.major === 'Other' ? (form.majorOther.trim() || null) : (form.major || null),
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return }
    setSaved(true)
    setSaving(false)
  }

  return (
    <Layout title="My Profile">
      <div className="max-w-lg">
        <div className="card mb-6">
          <h2 className="font-semibold text-white mb-1">Account Details</h2>
          <p className="text-slate-500 text-xs mb-4">Email cannot be changed — contact your VP of Academics &amp; Scholarship if needed.</p>
          <div className="mb-4 px-3 py-2 bg-slate-800 rounded-lg">
            <p className="text-slate-400 text-xs">Email</p>
            <p className="text-white text-sm mt-0.5">{profile.email}</p>
          </div>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" type="text" value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required maxLength={100} />
            </div>
            <div>
              <label className="label">Class Year</label>
              <select className="input" value={form.class_year}
                onChange={e => setForm(f => ({ ...f, class_year: e.target.value }))}>
                {CLASS_YEARS.map(yr => <option key={yr}>{yr}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Major</label>
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
            {error && <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}
            {saved && <p className="text-green-400 text-sm">✓ Profile updated.</p>}
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>

        {history.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-white mb-4">Grade History</h2>
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="flex flex-col py-2 border-b border-slate-700/50 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 text-sm">{h.semesterName}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500 text-xs">{new Date(h.submittedAt).toLocaleDateString()}</span>
                      {h.gpa != null
                        ? <span className={`font-semibold text-sm ${gpaColorClass(h.gpa)}`}>{h.gpa.toFixed(2)}</span>
                        : <span className="text-slate-500 text-sm">—</span>}
                    </div>
                  </div>
                  {h.adminNotes && (
                    <p className="text-amber-300 text-xs mt-0.5 ml-0.5">Note from VP: {h.adminNotes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect, supabase, session, profile } = await requireAuth(ctx)
  if (redirect) return { redirect }
  if (profile?.role === 'admin') return { redirect: { destination: '/admin', permanent: false } }

  const { data: submissions } = await supabase
    .from('submissions')
    .select('semester_id, final_gpa, status, submitted_at, admin_notes, semesters(name)')
    .eq('member_id', session!.user.id)
    .order('submitted_at', { ascending: false })

  const history: HistoryEntry[] = (submissions ?? []).map((s: any) => ({
    semesterName: s.semesters?.name ?? 'Unknown',
    gpa: s.final_gpa ?? null,
    status: s.status,
    submittedAt: s.submitted_at,
    adminNotes: s.admin_notes ?? null,
  }))

  return { props: { profile, history } }
}
