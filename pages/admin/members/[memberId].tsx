import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import Link from 'next/link'
import { useState } from 'react'
import { gpaColorClass } from '@/lib/gpa'
import type { Profile, Submission, Semester } from '@/lib/database.types'

interface EnrichedSubmission extends Submission {
  semester_name: string
  round_name: string | null
}

interface Props {
  member: Profile
  submissions: EnrichedSubmission[]
  semesters: Semester[]
}

export default function MemberDetailPage({ member: initialMember, submissions, semesters }: Props) {
  const [member, setMember] = useState(initialMember)
  const [savingRole, setSavingRole] = useState(false)
  const [notes, setNotes] = useState((initialMember as any).admin_notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [strikeSaving, setStrikeSaving] = useState(false)

  const strikes: number = (member as any).strikes ?? 0
  const strikeColor = strikes === 0 ? 'text-green-400' : strikes === 1 ? 'text-yellow-400' : strikes === 2 ? 'text-orange-400' : 'text-red-400'

  const saveNotes = async () => {
    setSavingNotes(true)
    setNotesSaved(false)
    await fetch('/api/members/update-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id, adminNotes: notes }),
    })
    setSavingNotes(false)
    setNotesSaved(true)
  }

  const adjustStrikes = async (action: 'add' | 'remove' | 'reset') => {
    setStrikeSaving(true)
    const res = await fetch('/api/members/log-strike', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id, action }),
    })
    const data = await res.json()
    if (res.ok) setMember(prev => ({ ...prev, strikes: data.strikes } as any))
    setStrikeSaving(false)
  }

  const reviewed = submissions.filter(s => s.final_gpa != null)
  const avgGpa = reviewed.length
    ? reviewed.reduce((a, b) => a + (b.final_gpa ?? 0), 0) / reviewed.length
    : null

  const toggleRole = async () => {
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    if (!window.confirm(newRole === 'admin' ? `Make ${member.full_name} an admin?` : `Remove admin access from ${member.full_name}?`)) return
    setSavingRole(true)
    const res = await fetch('/api/members/update-role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id, role: newRole }),
    })
    if (res.ok) setMember(prev => ({ ...prev, role: newRole }))
    setSavingRole(false)
  }

  return (
    <AdminLayout title={member.full_name}>
      <div className="mb-4">
        <Link href="/admin/members" className="text-slate-400 hover:text-white text-sm">← Back to Members</Link>
      </div>

      {/* Profile card */}
      <div className="card mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-white text-xl font-bold mb-1">{member.full_name}</h2>
            <p className="text-slate-400 text-sm">{member.email}</p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm">
              <span className="text-slate-300"><span className="text-slate-500">Year:</span> {member.class_year ?? '—'}</span>
              <span className="text-slate-300"><span className="text-slate-500">Major:</span> {member.major ?? '—'}</span>
              <span className={`font-medium px-2 py-0.5 rounded text-xs ${member.role === 'admin' ? 'bg-amber-900 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>{member.role}</span>
              <button onClick={toggleRole} disabled={savingRole} className="text-xs text-slate-400 hover:text-amber-400 transition-colors disabled:opacity-50 ml-1">
                {savingRole ? '…' : member.role === 'admin' ? 'Remove admin' : 'Make admin'}
              </button>
            </div>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs mb-1">Overall GPA</p>
            <p className={`text-3xl font-bold ${avgGpa != null ? gpaColorClass(avgGpa) : 'text-slate-500'}`}>
              {avgGpa != null ? avgGpa.toFixed(2) : '—'}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">{reviewed.length} graded submission{reviewed.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Strikes & admin notes */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-semibold text-white mb-3">Missed Submission Strikes</h3>
          <div className="flex items-center gap-4 mb-4">
            <span className={`font-bold text-5xl ${strikeColor}`}>{strikes}</span>
            <div>
              <p className="text-slate-400 text-xs">out of 3</p>
              {strikes === 0 && <p className="text-green-400 text-xs mt-0.5">Good standing</p>}
              {strikes >= 3 && <p className="text-red-400 text-xs font-semibold mt-0.5">Max strikes reached</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => adjustStrikes('add')} disabled={strikeSaving}
              className="text-xs bg-red-900/40 hover:bg-red-900/60 text-red-400 px-3 py-1.5 rounded border border-red-800/40 transition-colors">
              + Strike
            </button>
            <button onClick={() => adjustStrikes('remove')} disabled={strikeSaving || strikes === 0}
              className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded transition-colors disabled:opacity-40">
              − Strike
            </button>
            <button onClick={() => adjustStrikes('reset')} disabled={strikeSaving || strikes === 0}
              className="text-xs text-slate-500 hover:text-slate-300 underline ml-1 transition-colors disabled:opacity-40">
              Reset
            </button>
          </div>
        </div>
        <div className="card">
          <h3 className="font-semibold text-white mb-3">Admin Notes <span className="text-slate-500 font-normal text-xs">(private)</span></h3>
          <textarea
            className="input w-full resize-none"
            rows={3}
            placeholder="Notes visible only to admins…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={1000}
          />
          <div className="flex items-center gap-3 mt-2">
            <button onClick={saveNotes} disabled={savingNotes} className="btn-primary text-xs py-1.5 px-3">
              {savingNotes ? 'Saving…' : 'Save'}
            </button>
            {notesSaved && <span className="text-green-400 text-xs">✓ Saved</span>}
            <span className="text-slate-600 text-xs ml-auto">{notes.length}/1000</span>
          </div>
        </div>
      </div>

      {/* Submission history */}
      <h3 className="text-white font-semibold mb-3">Submission History</h3>
      {submissions.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">No submissions yet.</div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-700">
                  {['Semester', 'Round', 'Submitted', 'OCR GPA', 'Final GPA', 'Status', 'Ungr. Courses', 'Notes'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map(s => {
                  const naCount = s.course_grades
                    ? Object.values(s.course_grades as Record<string,string>).filter(v => v === 'N/A').length
                    : 0
                  const naCourses = s.course_grades
                    ? Object.entries(s.course_grades as Record<string,string>).filter(([,v]) => v === 'N/A').map(([k]) => k)
                    : []
                  return (
                  <tr key={s.id} className="border-b border-slate-700/50 hover:bg-slate-700/10">
                    <td className="px-4 py-3 text-white">{s.semester_name}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{s.round_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(s.submitted_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {s.no_grade ? <span className="text-slate-500 italic">N/A</span> : (
                        <span className={s.ocr_gpa != null ? gpaColorClass(s.ocr_gpa) : 'text-slate-400'}>
                          {s.ocr_gpa?.toFixed(2) ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={s.final_gpa != null ? `font-semibold ${gpaColorClass(s.final_gpa)}` : 'text-slate-400'}>
                        {s.final_gpa?.toFixed(2) ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {s.status === 'reviewed' && <span className="badge-reviewed">Reviewed</span>}
                        {s.status === 'no_grade' && <span className="badge-no-grade">No Grade</span>}
                        {s.status === 'pending' && <span className="badge-pending">Pending</span>}
                        {s.status === 'declined' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/40 text-red-400">Declined</span>}
                        {s.duplicate_flag && (
                          <span
                            className="text-xs text-amber-400 font-medium cursor-help"
                            title="This submission was flagged at upload — possible duplicate photo, name mismatch, or unrecognized screenshot"
                          >⚠ Flagged</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {naCount > 0 ? (
                        <span className="text-amber-400 text-xs" title={naCourses.join(', ')}>
                          {naCourses.join(', ')}
                        </span>
                      ) : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">{s.admin_notes ?? '—'}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect } = await requireAdmin(ctx)
  if (redirect) return { redirect }

  const memberId = ctx.params?.memberId as string
  const { supabaseAdmin } = await import('@/lib/supabaseAdmin')

  const [profileRes, subsRes, semsRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').eq('id', memberId).single(),
    supabaseAdmin
      .from('submissions')
      .select('*, semesters(name), semester_rounds(name)')
      .eq('member_id', memberId)
      .order('submitted_at', { ascending: false }),
    supabaseAdmin.from('semesters').select('id,name'),
  ])

  if (!profileRes.data) return { notFound: true }

  const submissions: EnrichedSubmission[] = (subsRes.data ?? []).map((s: any) => ({
    ...s,
    semester_name: s.semesters?.name ?? '—',
    round_name: s.semester_rounds?.name ?? null,
    semesters: undefined,
    semester_rounds: undefined,
  }))

  return { props: { member: profileRes.data, submissions, semesters: semsRes.data ?? [] } }
}
