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
                  {['Semester', 'Round', 'Submitted', 'OCR GPA', 'Final GPA', 'Status', 'Notes'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map(s => (
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
                      {s.duplicate_flag && <span className="badge-duplicate mr-1">⚠ Dup</span>}
                      {s.status === 'reviewed' && <span className="badge-reviewed">Reviewed</span>}
                      {s.status === 'no_grade' && <span className="badge-no-grade">No Grade</span>}
                      {s.status === 'pending' && <span className="badge-pending">Pending</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">{s.admin_notes ?? '—'}</td>
                  </tr>
                ))}
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
