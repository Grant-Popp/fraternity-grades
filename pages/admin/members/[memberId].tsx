import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import Link from 'next/link'
import { useState } from 'react'
import { gpaColorClass, gradeToGpa, GRADE_MAP } from '@/lib/gpa'
import type { Profile, Submission, MemberCourse } from '@/lib/database.types'

interface EnrichedSubmission extends Submission {
  semester_name: string
  round_name: string | null
  round_number: number | null
}

interface Props {
  member: Profile
  submissions: EnrichedSubmission[]
  coursesBySem: Record<string, MemberCourse[]>
}

function StatusBadge({ s }: { s: EnrichedSubmission }) {
  if (s.status === 'declined') return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400">Declined</span>
  if (s.status === 'reviewed') return <span className="badge-reviewed">Reviewed ✓</span>
  if (s.status === 'no_grade') return <span className="badge-no-grade">No Grade</span>
  if (s.duplicate_flag) return <span className="badge-duplicate">⚠ Review</span>
  return <span className="badge-pending">Pending</span>
}

function GpaEditor({
  sub,
  onSave,
  onDecline,
}: {
  sub: EnrichedSubmission
  onSave: (id: string, gpa: number | null, notes: string) => void
  onDecline: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [grade, setGrade] = useState(sub.admin_gpa?.toString() ?? '')
  const [notes, setNotes] = useState(sub.admin_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [decliningLoading, setDecliningLoading] = useState(false)

  const approve = async () => {
    setSaving(true)
    await fetch('/api/submissions/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: sub.id, adminGpa: sub.ocr_gpa, status: 'reviewed', adminNotes: '' }),
    })
    onSave(sub.id, sub.ocr_gpa, '')
    setSaving(false)
  }

  const save = async () => {
    setSaving(true)
    const gpa = grade ? parseFloat(grade) : null
    await fetch('/api/submissions/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: sub.id, adminGpa: gpa, status: 'reviewed', adminNotes: notes }),
    })
    onSave(sub.id, gpa, notes)
    setSaving(false)
    setEditing(false)
  }

  const confirmDecline = async () => {
    setDecliningLoading(true)
    await fetch('/api/submissions/decline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: sub.id, declineReason }),
    })
    onDecline(sub.id)
    setDecliningLoading(false)
    setDeclining(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 mt-2">
        <select className="input !py-1 !text-xs" value={grade} onChange={e => setGrade(e.target.value)}>
          <option value="">— No grade —</option>
          {Object.entries(GRADE_MAP).map(([g, pts]) => (
            <option key={g} value={pts}>{g} ({pts.toFixed(1)})</option>
          ))}
        </select>
        <input className="input !py-1 !text-xs" placeholder="Admin notes…" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} />
        <div className="flex gap-1.5">
          <button onClick={save} disabled={saving} className="btn-primary !py-1 !px-3 text-xs flex-1">{saving ? '…' : 'Save'}</button>
          <button onClick={() => setEditing(false)} className="btn-secondary !py-1 !px-3 text-xs">Cancel</button>
        </div>
      </div>
    )
  }

  if (declining) {
    return (
      <div className="flex flex-col gap-1.5 mt-2">
        <input
          className="input !py-1 !px-2 !text-xs"
          placeholder="Decline reason (optional)"
          value={declineReason}
          onChange={e => setDeclineReason(e.target.value)}
          maxLength={500}
        />
        <div className="flex gap-1.5">
          <button onClick={confirmDecline} disabled={decliningLoading}
            className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded transition-colors">
            {decliningLoading ? '…' : 'Confirm Decline'}
          </button>
          <button onClick={() => { setDeclining(false); setDeclineReason('') }} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mt-2">
      {sub.status === 'pending' && !sub.no_grade && (
        <>
          <button onClick={approve} disabled={saving}
            className="text-xs bg-green-700 hover:bg-green-600 text-white px-2.5 py-1 rounded transition-colors">
            {saving ? '…' : '✓ Approve'}
          </button>
          <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-amber-400">Edit GPA</button>
          <button onClick={() => setDeclining(true)} className="text-xs text-red-500 hover:text-red-400">✗ Decline</button>
        </>
      )}
      {sub.status === 'pending' && sub.no_grade && (
        <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-amber-400">Review</button>
      )}
      {sub.status === 'reviewed' && (
        <>
          <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-amber-400">Edit</button>
          <button onClick={() => setDeclining(true)} className="text-xs text-red-500 hover:text-red-400">✗ Decline</button>
        </>
      )}
      {sub.status === 'declined' && (
        <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-amber-400">Edit</button>
      )}
    </div>
  )
}

export default function MemberDetailPage({ member: initialMember, submissions: initialSubs, coursesBySem }: Props) {
  const [member, setMember] = useState(initialMember)
  const [subs, setSubs] = useState(initialSubs)
  const [savingRole, setSavingRole] = useState(false)
  const [notes, setNotes] = useState(initialMember.admin_notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [strikeSaving, setStrikeSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [loadingPhoto, setLoadingPhoto] = useState<string | null>(null)

  const strikes: number = member.strikes ?? 0
  const strikeColor = strikes === 0 ? 'text-green-400' : strikes === 1 ? 'text-yellow-400' : strikes === 2 ? 'text-orange-400' : 'text-red-400'

  const reviewed = subs.filter(s => s.final_gpa != null)
  const avgGpa = reviewed.length
    ? reviewed.reduce((a, b) => a + (b.final_gpa ?? 0), 0) / reviewed.length
    : null

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

  const handleViewPhoto = async (subId: string) => {
    if (expandedId === subId) { setExpandedId(null); return }
    setExpandedId(subId)
    if (!signedUrls[subId]) {
      setLoadingPhoto(subId)
      const res = await fetch(`/api/submissions/photo-url?submissionId=${subId}`)
      if (res.ok) {
        const { url } = await res.json()
        setSignedUrls(prev => ({ ...prev, [subId]: url }))
      }
      setLoadingPhoto(null)
    }
  }

  const handleSave = (id: string, gpa: number | null, notes: string) => {
    setSubs(prev => prev.map(s => s.id === id
      ? { ...s, admin_gpa: gpa, final_gpa: gpa ?? s.ocr_gpa, status: 'reviewed', admin_notes: notes }
      : s
    ))
  }

  const handleDecline = (id: string) => {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status: 'declined' } : s))
  }

  return (
    <AdminLayout title={member.full_name}>
      <div className="mb-4">
        <Link href="/admin/submissions" className="text-slate-400 hover:text-white text-sm">← Back to Submissions</Link>
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
              <button onClick={toggleRole} disabled={savingRole} className="text-xs text-slate-400 hover:text-amber-400 transition-colors disabled:opacity-50">
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
      {subs.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">No submissions yet.</div>
      ) : (
        <div className="space-y-4">
          {subs.map(s => {
            const courses = coursesBySem[s.semester_id] ?? []
            const isExpanded = expandedId === s.id
            return (
              <div key={s.id} className="card">
                {/* Submission header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{s.semester_name}</p>
                      {s.round_name && (
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{s.round_name}</span>
                      )}
                      <StatusBadge s={s} />
                      {s.duplicate_flag && s.status !== 'declined' && (
                        <span className="text-xs text-amber-400" title="Flagged for manual review">⚠ Flagged</span>
                      )}
                    </div>
                    <p className="text-slate-500 text-xs mt-1">
                      Submitted {new Date(s.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {s.reviewed_at && ` · Reviewed ${new Date(s.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {s.final_gpa != null ? (
                      <>
                        <p className={`text-2xl font-bold ${gpaColorClass(s.final_gpa)}`}>{s.final_gpa.toFixed(2)}</p>
                        <p className="text-slate-500 text-xs">Final GPA</p>
                      </>
                    ) : s.ocr_gpa != null ? (
                      <>
                        <p className={`text-2xl font-bold ${gpaColorClass(s.ocr_gpa)}`}>{s.ocr_gpa.toFixed(2)}</p>
                        <p className="text-slate-500 text-xs">OCR GPA</p>
                      </>
                    ) : null}
                  </div>
                </div>

                {s.admin_notes && (
                  <p className="mt-2 text-xs text-amber-300 bg-amber-900/20 px-3 py-1.5 rounded-lg">
                    Note from VP: {s.admin_notes}
                  </p>
                )}
                {s.decline_reason && (
                  <p className="mt-2 text-xs text-red-300 bg-red-900/20 px-3 py-1.5 rounded-lg">
                    Declined: {s.decline_reason}
                  </p>
                )}

                {/* Course grades table */}
                {courses.length > 0 && (
                  <div className="mt-4">
                    <p className="text-slate-400 text-xs font-medium mb-2">Registered Courses</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-700">
                            <th className="text-left py-1.5 pr-4 font-medium">Course</th>
                            <th className="text-left py-1.5 pr-4 font-medium">Name</th>
                            <th className="text-left py-1.5 pr-4 font-medium">Credits</th>
                            <th className="text-left py-1.5 pr-4 font-medium">Status</th>
                            <th className="text-left py-1.5 font-medium">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {courses.map(c => {
                            const detectedGrade = s.course_grades?.[c.course_id] ?? null
                            const gpa = detectedGrade ? gradeToGpa(detectedGrade) : null
                            return (
                              <tr key={c.id} className="border-b border-slate-800">
                                <td className="py-1.5 pr-4 text-slate-300 font-mono">{c.course_id}</td>
                                <td className="py-1.5 pr-4 text-slate-400 max-w-[180px] truncate">{c.course_name}</td>
                                <td className="py-1.5 pr-4 text-slate-400">{c.credits}</td>
                                <td className="py-1.5 pr-4">
                                  {c.status === 'dropped'
                                    ? <span className="text-red-400">Dropped</span>
                                    : <span className="text-slate-500">Active</span>}
                                </td>
                                <td className="py-1.5">
                                  {detectedGrade
                                    ? <span className={`font-semibold ${gpa != null ? gpaColorClass(gpa) : 'text-white'}`}>{detectedGrade}</span>
                                    : <span className="text-slate-600">—</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Photo + OCR */}
                <div className="mt-4 flex items-center gap-4 flex-wrap">
                  {s.photo_url && (
                    <button
                      onClick={() => handleViewPhoto(s.id)}
                      className="text-xs text-amber-400 hover:text-amber-300 whitespace-nowrap"
                    >
                      {loadingPhoto === s.id ? '…' : isExpanded ? 'Hide photo ↑' : 'View photo ↓'}
                    </button>
                  )}
                  {!s.photo_url && !s.no_grade && (
                    <span className="text-xs text-slate-600">No photo</span>
                  )}
                  {s.no_grade && <span className="text-xs text-slate-500 italic">No grade submitted</span>}
                </div>

                {isExpanded && s.photo_url && (
                  <div className="mt-4 flex gap-6 flex-wrap">
                    <div className="shrink-0">
                      {signedUrls[s.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={signedUrls[s.id]}
                          alt="Grade screenshot"
                          className="max-h-96 max-w-sm rounded border border-slate-600 object-contain cursor-pointer"
                          onClick={() => window.open(signedUrls[s.id], '_blank')}
                          title="Click to open full size"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-48 h-36 bg-slate-800 rounded border border-slate-600 text-slate-400 text-sm">
                          {loadingPhoto === s.id ? 'Loading…' : 'Could not load photo'}
                        </div>
                      )}
                      {signedUrls[s.id] && (
                        <a href={signedUrls[s.id]} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-amber-400 mt-1 block">
                          Open full size ↗
                        </a>
                      )}
                    </div>
                    {s.ocr_raw_text && (
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-400 text-xs font-medium mb-1">Raw OCR text:</p>
                        <pre className="text-xs text-slate-300 bg-slate-900 rounded p-3 overflow-auto max-h-32 whitespace-pre-wrap">{s.ocr_raw_text}</pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Review controls */}
                <GpaEditor sub={s} onSave={handleSave} onDecline={handleDecline} />
              </div>
            )
          })}
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

  const [profileRes, subsRes, coursesRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').eq('id', memberId).single(),
    supabaseAdmin
      .from('submissions')
      .select('*, semesters(name), semester_rounds(name, round_number)')
      .eq('member_id', memberId)
      .order('submitted_at', { ascending: false }),
    supabaseAdmin
      .from('member_courses')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: true }),
  ])

  if (!profileRes.data) return { notFound: true }

  const submissions: EnrichedSubmission[] = (subsRes.data ?? []).map((s: any) => ({
    ...s,
    semester_name: s.semesters?.name ?? '—',
    round_name: s.semester_rounds?.name ?? null,
    round_number: s.semester_rounds?.round_number ?? null,
    semesters: undefined,
    semester_rounds: undefined,
  }))

  const coursesBySem: Record<string, MemberCourse[]> = {}
  for (const c of (coursesRes.data ?? [])) {
    if (!coursesBySem[c.semester_id]) coursesBySem[c.semester_id] = []
    coursesBySem[c.semester_id].push(c as MemberCourse)
  }

  return { props: { member: profileRes.data, submissions, coursesBySem } }
}
