import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'
import type { Profile, Semester, SemesterRound, Submission } from '@/lib/database.types'
import Layout from '@/components/layout/Layout'
import Link from 'next/link'
import { gpaColorClass } from '@/lib/gpa'
import { useState, useEffect } from 'react'

interface ActiveRoundEntry {
  round: SemesterRound
  semesterName: string
  semesterId: string
  submission: Submission | null
  coursesEntered: boolean
}

interface Props {
  profile: Profile
  activeRounds: ActiveRoundEntry[]
  legacyActive: (Semester & { submission: Submission | null })[]
  past: (Semester & { submission: Submission | null })[]
}

function StatusBadge({ submission }: { submission: Submission | null }) {
  if (!submission) return <span className="badge-pending">Not Submitted</span>
  if (submission.status === 'no_grade') return <span className="badge-no-grade">No Grade</span>
  if (submission.status === 'reviewed') return <span className="badge-reviewed">Reviewed ✓</span>
  return <span className="badge-pending">Pending Review</span>
}

function DeadlineCountdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])
  const diff = new Date(deadline).getTime() - now
  if (diff < 0) return <span className="text-red-400 text-sm">Deadline passed</span>
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return <span className="text-amber-400 text-sm">{days}d {hours}h remaining</span>
  if (hours > 0) return <span className="text-orange-400 text-sm font-semibold">{hours}h remaining!</span>
  return <span className="text-red-400 text-sm font-semibold">Due very soon!</span>
}

export default function Dashboard({ profile, activeRounds, legacyActive, past }: Props) {
  const hasOpen = activeRounds.length > 0 || legacyActive.length > 0

  const latestGpa = (() => {
    const allSubs = [...activeRounds.map(r => r.submission), ...legacyActive.map(s => s.submission), ...past.map(s => s.submission)]
    return allSubs.filter(Boolean).reverse().find(s => s?.final_gpa != null)?.final_gpa ?? null
  })()

  const submittedCount = [
    ...activeRounds.filter(r => r.submission),
    ...legacyActive.filter(s => s.submission),
    ...past.filter(s => s.submission),
  ].length

  return (
    <Layout title={`Welcome, ${profile.full_name.split(' ')[0]}`}>
      {/* Stats row */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="card !p-4">
          <p className="text-slate-400 text-xs sm:text-sm">Class Year</p>
          <p className="text-white font-semibold text-sm sm:text-base truncate">{profile.class_year}</p>
        </div>
        <div className="card !p-4">
          <p className="text-slate-400 text-xs sm:text-sm">Submitted</p>
          <p className="text-white font-semibold text-sm sm:text-base">{submittedCount}</p>
        </div>
        <div className="card !p-4">
          <p className="text-slate-400 text-xs sm:text-sm">Latest GPA</p>
          <p className="font-semibold text-sm sm:text-base">
            {latestGpa != null
              ? <span className={gpaColorClass(latestGpa)}>{latestGpa.toFixed(2)}</span>
              : <span className="text-slate-400">—</span>}
          </p>
        </div>
      </div>

      {/* Open submissions */}
      {hasOpen && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">Open Submissions</h2>
          <div className="space-y-3">

            {/* Round-based entries */}
            {activeRounds.map(entry => (
              <div key={entry.round.id} className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white">{entry.semesterName}</p>
                  <p className="text-amber-400 text-xs">{entry.round.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <p className="text-slate-400 text-sm">
                      Due: {new Date(entry.round.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <DeadlineCountdown deadline={entry.round.deadline} />
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge submission={entry.submission} />
                  {!entry.submission && new Date(entry.round.deadline) > new Date() && (
                    <Link
                      href={`/submit/${entry.semesterId}`}
                      className={`text-sm px-4 py-1.5 whitespace-nowrap ${entry.coursesEntered ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {entry.coursesEntered ? 'Submit Grades →' : 'Set up courses →'}
                    </Link>
                  )}
                </div>
              </div>
            ))}

            {/* Legacy active semesters (no rounds) */}
            {legacyActive.map(s => (
              <div key={s.id} className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white">{s.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <p className="text-slate-400 text-sm">
                      Due: {new Date(s.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <DeadlineCountdown deadline={s.deadline} />
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge submission={s.submission} />
                  {!s.submission && new Date(s.deadline) > new Date() && (
                    <Link href={`/submit/${s.id}`} className="btn-primary text-sm px-4 py-1.5 whitespace-nowrap">
                      Submit Grades →
                    </Link>
                  )}
                </div>
              </div>
            ))}

          </div>
        </section>
      )}

      {!hasOpen && (
        <div className="card text-center py-12 mb-8">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-white font-semibold text-lg">No open submissions</p>
          <p className="text-slate-400 text-sm mt-1">The VP of Academics hasn&apos;t opened a new round yet.</p>
          <p className="text-slate-500 text-xs mt-3">Questions? Contact your chapter&apos;s VP of Academics directly.</p>
        </div>
      )}

      {/* Past history */}
      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Past Semesters</h2>
          <div className="card overflow-hidden !p-0">
            <div className="overflow-x-auto">
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

  const memberYear = profile?.class_year ?? ''

  const [
    { data: semesters },
    { data: activeRoundsRaw },
    { data: submissions },
    { data: courseRows },
  ] = await Promise.all([
    supabase.from('semesters').select('*').order('created_at', { ascending: false }),
    supabase.from('semester_rounds').select('*').eq('is_active', true).order('round_number', { ascending: false }),
    supabase.from('submissions').select('*').eq('member_id', session!.user.id),
    supabase.from('member_courses').select('semester_id').eq('member_id', session!.user.id),
  ])

  const semMap = new Map((semesters ?? []).map(s => [s.id, s]))
  const subByRoundId = new Map((submissions ?? []).filter((s: any) => s.round_id).map((s: any) => [s.round_id!, s]))
  const subBySemId = new Map((submissions ?? []).filter((s: any) => !s.round_id).map((s: any) => [s.semester_id, s]))
  const coursesEnteredFor = new Set((courseRows ?? []).map((c: any) => c.semester_id))

  // Active rounds (only for active semesters the member is required to submit for)
  const roundSemesterIds = new Set<string>()
  const activeRounds: ActiveRoundEntry[] = (activeRoundsRaw ?? []).flatMap((r: any) => {
    const sem = semMap.get(r.semester_id)
    if (!sem?.is_active) return []
    if (sem.required_years?.length && !sem.required_years.includes(memberYear)) return []
    roundSemesterIds.add(r.semester_id)
    return [{
      round: r,
      semesterName: sem.name,
      semesterId: r.semester_id,
      submission: subByRoundId.get(r.id) ?? null,
      coursesEntered: coursesEnteredFor.has(r.semester_id),
    }]
  })

  // Active semesters with no rounds yet (legacy flow)
  const legacyActive = (semesters ?? [])
    .filter((s: any) => s.is_active && !roundSemesterIds.has(s.id))
    .filter((s: any) => !s.required_years?.length || s.required_years.includes(memberYear))
    .map((s: any) => ({ ...s, submission: subBySemId.get(s.id) ?? null }))

  // Past (inactive) semesters for history
  const past = (semesters ?? [])
    .filter((s: any) => !s.is_active)
    .filter((s: any) => !s.required_years?.length || s.required_years.includes(memberYear))
    .map((s: any) => {
      const sub = (submissions ?? [])
        .filter((sub: any) => sub.semester_id === s.id)
        .sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0] ?? null
      return { ...s, submission: sub }
    })

  return { props: { profile, activeRounds, legacyActive, past } }
}
