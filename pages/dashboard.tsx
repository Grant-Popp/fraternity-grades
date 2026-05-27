import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'
import type { Profile, Semester, Submission } from '@/lib/database.types'
import Layout from '@/components/layout/Layout'
import Link from 'next/link'
import { gpaColorClass } from '@/lib/gpa'

interface Props {
  profile: Profile
  semesters: (Semester & { submission: Submission | null })[]
}

function StatusBadge({ submission }: { submission: Submission | null }) {
  if (!submission) return <span className="badge-pending">Not Submitted</span>
  if (submission.status === 'no_grade') return <span className="badge-no-grade">No Grade</span>
  if (submission.status === 'reviewed') return <span className="badge-reviewed">Reviewed ✓</span>
  return <span className="badge-pending">Pending Review</span>
}

function DeadlineCountdown({ deadline }: { deadline: string }) {
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff < 0) return <span className="text-red-400 text-sm">Deadline passed</span>
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return <span className="text-amber-400 text-sm">{days}d {hours}h remaining</span>
  if (hours > 0) return <span className="text-orange-400 text-sm font-semibold">{hours}h remaining!</span>
  return <span className="text-red-400 text-sm font-semibold">Due very soon!</span>
}

export default function Dashboard({ profile, semesters }: Props) {
  const active = semesters.filter(s => s.is_active)
  const past = semesters.filter(s => !s.is_active)

  return (
    <Layout title={`Welcome, ${profile.full_name.split(' ')[0]}`}>
      <div className="mb-6 flex items-center gap-3">
        <div className="card !p-4 flex-1">
          <p className="text-slate-400 text-sm">Class Year</p>
          <p className="text-white font-semibold">{profile.class_year}</p>
        </div>
        <div className="card !p-4 flex-1">
          <p className="text-slate-400 text-sm">Semesters Submitted</p>
          <p className="text-white font-semibold">{semesters.filter(s => s.submission).length}</p>
        </div>
        <div className="card !p-4 flex-1">
          <p className="text-slate-400 text-sm">Latest GPA</p>
          <p className="font-semibold">
            {(() => {
              const last = [...semesters].reverse().find(s => s.submission?.final_gpa)
              return last?.submission?.final_gpa
                ? <span className={gpaColorClass(last.submission.final_gpa)}>{last.submission.final_gpa.toFixed(2)}</span>
                : <span className="text-slate-400">—</span>
            })()}
          </p>
        </div>
      </div>

      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">Open Submissions</h2>
          <div className="space-y-3">
            {active.map(s => (
              <div key={s.id} className="card flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-white">{s.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-slate-400 text-sm">Due: {new Date(s.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                    <DeadlineCountdown deadline={s.deadline} />
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge submission={s.submission} />
                  {!s.submission && new Date(s.deadline) > new Date() && (
                    <Link href={`/submit/${s.id}`} className="btn-primary text-sm px-4 py-1.5">
                      Submit Grades →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {active.length === 0 && (
        <div className="card text-center py-12 mb-8">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-white font-semibold text-lg">No open submissions</p>
          <p className="text-slate-400 text-sm mt-1">Check back when the VP of Academics opens a new semester.</p>
        </div>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Past Semesters</h2>
          <div className="card overflow-hidden !p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Semester</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">GPA</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {past.map(s => (
                  <tr key={s.id} className="border-b border-slate-700/50 last:border-0">
                    <td className="px-4 py-3 text-white">{s.name}</td>
                    <td className="px-4 py-3 text-center">
                      {s.submission?.final_gpa
                        ? <span className={`font-semibold ${gpaColorClass(s.submission.final_gpa)}`}>{s.submission.final_gpa.toFixed(2)}</span>
                        : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge submission={s.submission} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Layout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect, supabase, session, profile } = await requireAuth(ctx)
  if (redirect) return { redirect }
  if (profile?.role === 'admin') return { redirect: { destination: '/admin', permanent: false } }

  const { data: semesters } = await supabase.from('semesters').select('*').order('created_at', { ascending: false })
  const { data: submissions } = await supabase.from('submissions').select('*').eq('member_id', session!.user.id)

  const subMap = new Map((submissions ?? []).map(s => [s.semester_id, s]))
  const enriched = (semesters ?? []).map(s => ({ ...s, submission: subMap.get(s.id) ?? null }))

  return { props: { profile, semesters: enriched } }
}
