import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import { useState } from 'react'
import Link from 'next/link'
import { gpaColorClass, gradeToGpa, GRADE_MAP } from '@/lib/gpa'
import type { Submission, Profile, Semester, DropAlert } from '@/lib/database.types'

interface DuplicateMatch {
  id: string
  memberId: string
  memberName: string
  submittedAt: string
  semesterName: string
}

interface EnrichedSubmission extends Submission {
  member_name: string
  member_class_year: string
  semester_name: string
  round_name: string | null
  round_number: number | null
  duplicate_matches?: DuplicateMatch[]
}

interface Props {
  submissions: EnrichedSubmission[]
  semesters: Semester[]
  dropAlerts: DropAlert[]
}

function StatusBadge({ s }: { s: EnrichedSubmission }) {
  if (s.status === 'declined') return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400">Declined</span>
  if (s.status === 'reviewed') return (
    <div className="flex items-center gap-1.5">
      {s.duplicate_flag && <span title="Photo was flagged at submission" className="text-amber-400 text-xs">⚠</span>}
      <span className="badge-reviewed">Reviewed</span>
    </div>
  )
  if (s.duplicate_flag) return <span className="badge-duplicate">⚠ Review</span>
  if (s.status === 'no_grade') return <span className="badge-no-grade">No Grade</span>
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
    const gpa = sub.ocr_gpa
    await fetch('/api/submissions/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: sub.id, adminGpa: gpa, status: 'reviewed', adminNotes: '' }),
    })
    onSave(sub.id, gpa, '')
    setSaving(false)
  }

  const save = async () => {
    if (!grade && sub.ocr_gpa == null) {
      if (!window.confirm('No grade is set and OCR found nothing. This will be marked reviewed with no GPA. Continue?')) return
    }
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
      <div className="flex flex-col gap-1 min-w-[160px]">
        <select className="input !py-1 !text-xs" value={grade} onChange={e => setGrade(e.target.value)}>
          <option value="">— No grade —</option>
          {Object.entries(GRADE_MAP).map(([g, pts]) => (
            <option key={g} value={pts}>{g} ({pts.toFixed(1)})</option>
          ))}
        </select>
        <input className="input !py-1 !text-xs" placeholder="Admin notes…" value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="flex gap-1">
          <button onClick={save} disabled={saving} className="btn-primary !py-0.5 !px-2 text-xs flex-1">{saving ? '…' : 'Save'}</button>
          <button onClick={() => setEditing(false)} className="btn-secondary !py-0.5 !px-2 text-xs">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`font-semibold ${sub.final_gpa != null ? gpaColorClass(sub.final_gpa) : 'text-slate-400'}`}>
        {sub.final_gpa?.toFixed(2) ?? '—'}
      </span>

      {declining ? (
        <div className="flex items-center gap-1 flex-wrap">
          <input
            className="input !py-0.5 !px-2 !text-xs w-36"
            placeholder="Reason (optional)"
            value={declineReason}
            onChange={e => setDeclineReason(e.target.value)}
            maxLength={500}
          />
          <button
            onClick={confirmDecline}
            disabled={decliningLoading}
            className="text-xs bg-red-700 hover:bg-red-600 text-white px-2 py-0.5 rounded transition-colors"
          >
            {decliningLoading ? '…' : 'Confirm'}
          </button>
          <button onClick={() => { setDeclining(false); setDeclineReason('') }} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
        </div>
      ) : (
        <>
          {sub.status === 'pending' && !sub.no_grade && (
            <>
              <button
                onClick={approve}
                disabled={saving}
                className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-0.5 rounded transition-colors"
              >
                {saving ? '…' : '✓ Approve'}
              </button>
              <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-amber-400">Edit</button>
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
            <>
              <span className="text-xs text-red-400 italic">Declined</span>
              <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-amber-400">Edit</button>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default function SubmissionsPage({ submissions: initialSubs, semesters, dropAlerts: initialAlerts }: Props) {
  const [subs, setSubs] = useState(initialSubs)
  const [alerts, setAlerts] = useState(initialAlerts)
  const [filterSem, setFilterSem] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterYear, setFilterYear] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [loadingPhoto, setLoadingPhoto] = useState<string | null>(null)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  const acknowledgeAlert = async (alertId: string) => {
    await fetch('/api/drops/acknowledge', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId }),
    })
    setAlerts(prev => prev.filter(a => a.id !== alertId))
  }

  const flaggedCount = subs.filter(s => s.duplicate_flag && s.status === 'pending').length

  const filtered = subs
    .filter(s => {
      if (filterSem !== 'all' && s.semester_id !== filterSem) return false
      if (filterStatus === 'flagged') { if (!s.duplicate_flag) return false }
      else if (filterStatus !== 'all') { if (s.status !== filterStatus) return false }
      if (filterYear !== 'all' && s.member_class_year !== filterYear) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (!s.member_name.toLowerCase().includes(q)) return false
      }
      return true
    })
    // Flagged pending submissions always sort to the top
    .sort((a, b) => {
      const aFlag = a.duplicate_flag && a.status === 'pending' ? 0 : 1
      const bFlag = b.duplicate_flag && b.status === 'pending' ? 0 : 1
      return aFlag - bFlag
    })

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

  const bulkApprove = async () => {
    if (filterSem === 'all') return
    const pendingCount = filtered.filter(s => s.status === 'pending' && !s.no_grade && !s.duplicate_flag).length
    if (pendingCount === 0) { setBulkResult('No eligible submissions to approve.'); return }
    if (!window.confirm(`Approve ${pendingCount} pending, non-flagged submissions using their OCR GPA?`)) return
    setBulkApproving(true)
    setBulkResult(null)
    const res = await fetch('/api/submissions/bulk-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId: filterSem }),
    })
    const data = await res.json()
    if (res.ok) {
      setSubs(prev => prev.map(s =>
        s.semester_id === filterSem && s.status === 'pending' && !s.no_grade && !s.duplicate_flag && s.ocr_gpa != null
          ? { ...s, status: 'reviewed', admin_gpa: s.ocr_gpa, final_gpa: s.ocr_gpa }
          : s
      ))
      setBulkResult(`✓ Approved ${data.approved} submissions`)
    } else {
      setBulkResult(`Error: ${data.error}`)
    }
    setBulkApproving(false)
  }

  return (
    <AdminLayout title="Submissions">
      {/* Drop alerts */}
      {alerts.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-red-400 text-sm font-semibold">⚠️ {alerts.length} Course Drop Alert{alerts.length !== 1 ? 's' : ''}</p>
          {alerts.map(a => (
            <div key={a.id} className="flex items-center justify-between bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3 gap-4">
              <div>
                <p className="text-white text-sm font-medium">
                  {a.member_name} dropped <span className="text-red-300">{a.course_id} — {a.course_name}</span> ({a.credits} cr)
                </p>
                <p className="text-slate-400 text-xs mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
              </div>
              <button
                onClick={() => acknowledgeAlert(a.id)}
                className="text-xs text-slate-400 hover:text-slate-200 shrink-0 border border-slate-600 rounded px-2 py-1"
              >
                Acknowledge
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        {/* Name search */}
        <input
          className="input !w-44"
          type="text"
          placeholder="Search member…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input !w-auto" value={filterSem} onChange={e => { setFilterSem(e.target.value); setBulkResult(null) }}>
          <option value="all">All Semesters</option>
          {semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input !w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="no_grade">No Grade</option>
          <option value="declined">Declined</option>
          <option value="flagged">⚠ Flagged</option>
        </select>
        <select className="input !w-auto" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
          <option value="all">All Years</option>
          {['Freshman','Sophomore','Junior','Senior'].map(yr => <option key={yr}>{yr}</option>)}
        </select>
        <div className="flex items-center gap-3 self-center">
          <span className="text-slate-400 text-sm">{filtered.length} results</span>
          {flaggedCount > 0 && (
            <button
              onClick={() => setFilterStatus('flagged')}
              className="text-xs bg-amber-900/40 border border-amber-700/50 text-amber-400 px-2.5 py-1 rounded-full hover:bg-amber-900/70 transition-colors"
            >
              ⚠ {flaggedCount} need review
            </button>
          )}
        </div>
        {filterSem !== 'all' && (
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={bulkApprove}
              disabled={bulkApproving}
              className="text-xs bg-green-800 hover:bg-green-700 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-60"
              title="Approve all pending, non-flagged submissions using their OCR GPA"
            >
              {bulkApproving ? '…' : '✓ Bulk Approve'}
            </button>
            {bulkResult && <span className={`text-xs ${bulkResult.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{bulkResult}</span>}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-700">
                {['Member','Year','Semester','Round','Submitted','OCR GPA','Final GPA','Status','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <>
                  <tr key={s.id} className={`border-b border-slate-700/50 hover:bg-slate-700/20 ${expandedId === s.id ? 'bg-slate-800/40' : ''}`}>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/admin/members/${s.member_id}`} className="text-white hover:text-amber-400 transition-colors">
                        {s.member_name}
                      </Link>
                      {s.course_grades && Object.keys(s.course_grades).length > 0 && (
                        <span className="ml-1.5 text-xs text-slate-500" title="Has per-course grades — click name to review">
                          {Object.keys(s.course_grades).length} courses
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{s.member_class_year}</td>
                    <td className="px-4 py-3 text-slate-300">{s.semester_name}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                      {s.round_name ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(s.submitted_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {s.no_grade ? <span className="text-slate-500 italic">N/A</span> : (
                        <span className={s.ocr_gpa != null ? gpaColorClass(s.ocr_gpa) : 'text-slate-400'}>
                          {s.ocr_gpa?.toFixed(2) ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <GpaEditor sub={s} onSave={handleSave} onDecline={handleDecline} />
                    </td>
                    <td className="px-4 py-3"><StatusBadge s={s} /></td>
                    <td className="px-4 py-3">
                      {s.photo_url ? (
                        <button
                          onClick={() => handleViewPhoto(s.id)}
                          className="text-xs text-amber-400 hover:text-amber-300 whitespace-nowrap"
                        >
                          {loadingPhoto === s.id ? '…' : expandedId === s.id ? 'Hide ↑' : 'View Photo ↓'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">No photo</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === s.id && s.photo_url && (
                    <tr key={`${s.id}-expand`} className="bg-slate-950/60 border-b border-slate-700">
                      <td colSpan={9} className="px-4 py-5">
                        <div className="flex gap-6 flex-wrap">
                          <div className="shrink-0">
                            {signedUrls[s.id] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={signedUrls[s.id]} alt="Grade screenshot" className="max-h-96 max-w-sm rounded border border-slate-600 object-contain cursor-pointer"
                                onClick={() => window.open(signedUrls[s.id], '_blank')} title="Click to open full size" />
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
                          <div className="flex-1 min-w-0 space-y-3">
                            {s.course_grades && Object.keys(s.course_grades).length > 0 && (
                              <div>
                                <p className="text-slate-400 text-xs mb-2 font-medium">OCR-detected course grades:</p>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(s.course_grades).map(([course, grade]) => {
                                    const gpa = gradeToGpa(grade)
                                    return (
                                      <span key={course} className="text-xs bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-full">
                                        <span className="text-slate-400">{course}</span>
                                        {' '}
                                        <span className={`font-semibold ${gpa != null ? gpaColorClass(gpa) : 'text-white'}`}>{grade}</span>
                                      </span>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                            <div>
                              <p className="text-slate-400 text-xs mb-1 font-medium">Raw OCR text:</p>
                              <pre className="text-xs text-slate-300 bg-slate-900 rounded p-3 overflow-auto max-h-32 whitespace-pre-wrap">{s.ocr_raw_text || '(none)'}</pre>
                            </div>
                            {s.duplicate_flag && (
                              <div className="bg-amber-950/40 border border-amber-700/40 rounded-lg px-3 py-3">
                                <p className="text-amber-400 text-sm font-semibold mb-2">⚠ Flagged for manual review</p>
                                {s.duplicate_matches && s.duplicate_matches.length > 0 ? (
                                  <div className="mb-2">
                                    <p className="text-amber-300 text-xs font-medium mb-1">Near-identical photo also found in:</p>
                                    <ul className="space-y-0.5">
                                      {s.duplicate_matches.map(m => (
                                        <li key={m.id} className="text-xs text-amber-200">
                                          •{' '}
                                          <Link href={`/admin/members/${m.memberId}`} className="font-medium underline hover:text-amber-400 transition-colors">
                                            {m.memberName}
                                          </Link>
                                          {' '}— {m.semesterName} (submitted {new Date(m.submittedAt).toLocaleDateString()})
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                                <p className="text-slate-400 text-xs">Other possible triggers: photo editing software detected in EXIF, member's name not found in screenshot, or page does not appear to be from a grade portal.</p>
                              </div>
                            )}
                            {s.admin_notes && (
                              <p className="text-amber-300 text-sm bg-amber-900/20 px-3 py-2 rounded">Note: {s.admin_notes}</p>
                            )}
                            {s.reviewed_at && (
                              <p className="text-slate-600 text-xs">Reviewed {new Date(s.reviewed_at).toLocaleString()}</p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-slate-400 py-12">No submissions match the current filters.</p>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect, supabase } = await requireAdmin(ctx)
  if (redirect) return { redirect }

  const { supabaseAdmin } = await import('@/lib/supabaseAdmin')

  const [rawSubsRes, semestersRes, dropAlertsRes] = await Promise.all([
    supabaseAdmin
      .from('submissions')
      .select('*, profiles(full_name, class_year), semesters(name), semester_rounds(name, round_number)')
      .order('submitted_at', { ascending: false }),
    supabase.from('semesters').select('id,name').order('created_at', { ascending: false }),
    supabaseAdmin.from('drop_alerts').select('*').eq('acknowledged', false).order('created_at', { ascending: false }),
  ])

  const submissions: EnrichedSubmission[] = (rawSubsRes.data ?? []).map((s: any) => ({
    ...s,
    member_name: s.profiles?.full_name ?? 'Unknown',
    member_class_year: s.profiles?.class_year ?? '—',
    semester_name: s.semesters?.name ?? '—',
    round_name: s.semester_rounds?.name ?? null,
    round_number: s.semester_rounds?.round_number ?? null,
    profiles: undefined,
    semesters: undefined,
    semester_rounds: undefined,
  }))

  // Compute phash duplicate matches for flagged submissions (threshold 8, matches submission logic)
  try {
    const { hammingDistance } = await import('@/lib/phash')
    const subsWithHash = submissions.filter(s => s.photo_phash)
    for (const sub of submissions) {
      if (!sub.duplicate_flag || !sub.photo_phash) continue
      sub.duplicate_matches = subsWithHash
        .filter(other => other.id !== sub.id && other.member_id !== sub.member_id && other.photo_phash)
        .filter(other => hammingDistance(sub.photo_phash!, other.photo_phash!) <= 8)
        .map(other => ({
          id: other.id,
          memberId: other.member_id,
          memberName: other.member_name,
          submittedAt: other.submitted_at,
          semesterName: other.semester_name,
        }))
    }
  } catch {}

  return { props: { submissions, semesters: semestersRes.data ?? [], dropAlerts: dropAlertsRes.data ?? [] } }
}
