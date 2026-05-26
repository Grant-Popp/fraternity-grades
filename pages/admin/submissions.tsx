import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import { useState } from 'react'
import { gpaColorClass, GRADE_MAP } from '@/lib/gpa'
import type { Submission, Profile, Semester } from '@/lib/database.types'

interface EnrichedSubmission extends Submission {
  member_name: string
  member_class_year: string
  semester_name: string
  photo_signed_url: string | null
}

interface Props {
  submissions: EnrichedSubmission[]
  semesters: Semester[]
}

function StatusBadge({ s }: { s: EnrichedSubmission }) {
  if (s.duplicate_flag) return <span className="badge-duplicate">⚠ Duplicate</span>
  if (s.status === 'reviewed') return <span className="badge-reviewed">Reviewed</span>
  if (s.status === 'no_grade') return <span className="badge-no-grade">No Grade</span>
  return <span className="badge-pending">Pending</span>
}

function GpaEditor({ sub, onSave }: { sub: EnrichedSubmission; onSave: (id: string, gpa: number | null, notes: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [grade, setGrade] = useState(sub.admin_gpa?.toString() ?? '')
  const [notes, setNotes] = useState(sub.admin_notes ?? '')
  const [saving, setSaving] = useState(false)

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

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className={`font-semibold ${sub.final_gpa != null ? gpaColorClass(sub.final_gpa) : 'text-slate-400'}`}>
          {sub.final_gpa?.toFixed(2) ?? '—'}
        </span>
        {sub.status !== 'no_grade' && (
          <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-amber-400">Edit</button>
        )}
      </div>
    )
  }

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

export default function SubmissionsPage({ submissions: initialSubs, semesters }: Props) {
  const [subs, setSubs] = useState(initialSubs)
  const [filterSem, setFilterSem] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterYear, setFilterYear] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = subs.filter(s => {
    if (filterSem !== 'all' && s.semester_id !== filterSem) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterYear !== 'all' && s.member_class_year !== filterYear) return false
    return true
  })

  const handleSave = (id: string, gpa: number | null, notes: string) => {
    setSubs(prev => prev.map(s => s.id === id
      ? { ...s, admin_gpa: gpa, final_gpa: gpa ?? s.ocr_gpa, status: 'reviewed', admin_notes: notes }
      : s
    ))
  }

  return (
    <AdminLayout title="Submissions">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select className="input !w-auto" value={filterSem} onChange={e => setFilterSem(e.target.value)}>
          <option value="all">All Semesters</option>
          {semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input !w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="no_grade">No Grade</option>
        </select>
        <select className="input !w-auto" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
          <option value="all">All Years</option>
          {['Freshman','Sophomore','Junior','Senior'].map(yr => <option key={yr}>{yr}</option>)}
        </select>
        <span className="text-slate-400 text-sm self-center">{filtered.length} results</span>
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-700">
                {['Member','Year','Semester','Submitted','OCR GPA','Final GPA','Status','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <>
                  <tr key={s.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-white font-medium">{s.member_name}</td>
                    <td className="px-4 py-3 text-slate-300">{s.member_class_year}</td>
                    <td className="px-4 py-3 text-slate-300">{s.semester_name}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(s.submitted_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {s.no_grade ? <span className="text-slate-500 italic">N/A</span> : (
                        <span className={s.ocr_gpa != null ? gpaColorClass(s.ocr_gpa) : 'text-slate-400'}>
                          {s.ocr_gpa?.toFixed(2) ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <GpaEditor sub={s} onSave={handleSave} />
                    </td>
                    <td className="px-4 py-3"><StatusBadge s={s} /></td>
                    <td className="px-4 py-3">
                      {s.photo_url && (
                        <button
                          onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                          className="text-xs text-amber-400 hover:text-amber-300"
                        >
                          {expandedId === s.id ? 'Hide' : 'View Photo'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === s.id && s.photo_signed_url && (
                    <tr key={`${s.id}-expand`} className="bg-slate-900/40">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="flex gap-6">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.photo_signed_url} alt="Grade screenshot" className="max-h-80 rounded border border-slate-600 object-contain" />
                          <div className="flex-1">
                            <p className="text-slate-400 text-xs mb-2">Raw OCR text:</p>
                            <pre className="text-xs text-slate-300 bg-slate-900 rounded p-3 overflow-auto max-h-40">{s.ocr_raw_text ?? '—'}</pre>
                            {s.duplicate_flag && (
                              <p className="text-red-400 text-sm mt-3 bg-red-900/20 px-3 py-2 rounded-lg">
                                ⚠️ <strong>Possible duplicate photo</strong> — this image is very similar to a previous submission from this member. Verify it shows current grades.
                              </p>
                            )}
                            {s.admin_notes && <p className="text-amber-300 text-sm mt-2">Note: {s.admin_notes}</p>}
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

  const { data: rawSubs } = await supabaseAdmin
    .from('submissions')
    .select('*, profiles(full_name, class_year), semesters(name)')
    .order('submitted_at', { ascending: false })

  const { data: semesters } = await supabase.from('semesters').select('id,name').order('created_at', { ascending: false })

  const submissions = await Promise.all((rawSubs ?? []).map(async (s: any) => {
    let photo_signed_url: string | null = null
    if (s.photo_url) {
      const { data } = await supabaseAdmin.storage.from('grade-photos').createSignedUrl(s.photo_url, 3600)
      photo_signed_url = data?.signedUrl ?? null
    }
    return {
      ...s,
      member_name: s.profiles?.full_name ?? 'Unknown',
      member_class_year: s.profiles?.class_year ?? '—',
      semester_name: s.semesters?.name ?? '—',
      photo_signed_url,
      profiles: undefined,
      semesters: undefined,
    }
  }))

  return { props: { submissions, semesters: semesters ?? [] } }
}
