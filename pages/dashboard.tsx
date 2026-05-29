import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'
import type { Profile, Semester, SemesterRound, Submission } from '@/lib/database.types'
import Layout from '@/components/layout/Layout'
import Link from 'next/link'
import { gpaColorClass } from '@/lib/gpa'
import { useState, useEffect } from 'react'

function TrendArrow({ current, previous }: { current: number; previous: number | null }) {
  if (previous == null) return null
  const diff = current - previous
  if (Math.abs(diff) < 0.05) return null
  if (diff > 0) return <span className="text-green-400 text-sm ml-1" title={`+${diff.toFixed(2)} from last`}>↑</span>
  return <span className="text-red-400 text-sm ml-1" title={`${diff.toFixed(2)} from last`}>↓</span>
}

interface ActiveRoundEntry {
  round: SemesterRound
  semesterName: string
  semesterId: string
  submission: Submission | null
  coursesEntered: boolean
}

interface PastEntry {
  semesterId: string
  semesterName: string
  roundId: string | null
  roundName: string | null
  submission: Submission | null
}

interface PastSemesterGroup {
  semesterId: string
  semesterName: string
  semesterGpa: number | null
  rounds: PastEntry[]
}

interface Props {
  profile: Profile
  activeRounds: ActiveRoundEntry[]
  legacyActive: (Semester & { submission: Submission | null })[]
  past: PastSemesterGroup[]
  isAtRisk: boolean
  gpaThreshold: number
}

function StatusBadge({ submission }: { submission: Submission | null }) {
  if (!submission) return <span className="badge-pending">Not Submitted</span>
  if (submission.status === 'declined') return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400">Declined</span>
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

function WithdrawButton({ submissionId, onWithdrawn }: { submissionId: string; onWithdrawn: () => void }) {
  const [loading, setLoading] = useState(false)
  const withdraw = async () => {
    if (!window.confirm('Withdraw your submission? You can resubmit before the deadline, but this cannot be undone.')) return
    setLoading(true)
    const res = await fetch('/api/submissions/withdraw', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId }),
    })
    if (res.ok) {
      onWithdrawn()
    } else {
      const data = await res.json().catch(() => ({}))
      setLoading(false)
      alert(data.error ?? 'Could not withdraw submission. Please refresh the page and try again.')
    }
  }
  return (
    <button onClick={withdraw} disabled={loading} className="text-xs text-slate-500 hover:text-red-400 transition-colors">
      {loading ? '…' : 'Withdraw'}
    </button>
  )
}

export default function Dashboard({ profile, activeRounds: initialRounds, legacyActive: initialLegacy, past, isAtRisk, gpaThreshold }: Props) {
  const [activeRounds, setActiveRounds] = useState(initialRounds)
  const [legacyActive, setLegacyActive] = useState(initialLegacy)
  const hasOpen = activeRounds.length > 0 || legacyActive.length > 0

  const pastEntries = past.flatMap(g => g.rounds)

  const [latestGpa, previousGpa] = (() => {
    const allSubs = [...activeRounds.map(r => r.submission), ...legacyActive.map(s => s.submission), ...pastEntries.map(e => e.submission)]
    const withGpa = allSubs.filter((s): s is Submission => s?.final_gpa != null).reverse()
    return [withGpa[0]?.final_gpa ?? null, withGpa[1]?.final_gpa ?? null]
  })()

  const submittedCount = [
    ...activeRounds.filter(r => r.submission),
    ...legacyActive.filter(s => s.submission),
    ...pastEntries.filter(e => e.submission),
  ].length

  return (
    <Layout title={`Welcome, ${profile.full_name.split(' ')[0]}`}>
      {/* At-risk warning */}
      {isAtRisk && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-red-700 bg-red-900/20">
          <p className="text-red-300 font-semibold text-sm">Academic Standing Warning</p>
          <p className="text-slate-400 text-sm mt-0.5">
            Your current GPA is below the chapter minimum of {gpaThreshold.toFixed(2)}. Please contact your VP of Academics & Scholarship.
          </p>
        </div>
      )}
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
          <p className="font-semibold text-sm sm:text-base flex items-center">
            {latestGpa != null
              ? <><span className={gpaColorClass(latestGpa)}>{latestGpa.toFixed(2)}</span><TrendArrow current={latestGpa} previous={previousGpa} /></>
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
                    {(!entry.submission || entry.submission.status === 'declined') && <DeadlineCountdown deadline={entry.round.deadline} />}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge submission={entry.submission} />
                  {(entry.submission?.status === 'pending' || entry.submission?.status === 'no_grade') && new Date(entry.round.deadline) > new Date() && (
                    <WithdrawButton
                      submissionId={entry.submission.id}
                      onWithdrawn={() => setActiveRounds(prev => prev.map(r => r.round.id === entry.round.id ? { ...r, submission: null } : r))}
                    />
                  )}
                  {(!entry.submission || entry.submission.status === 'declined') && new Date(entry.round.deadline) > new Date() && (
                    <Link
                      href={`/submit/${entry.semesterId}`}
                      className={`text-sm px-4 py-1.5 whitespace-nowrap ${entry.submission?.status === 'declined' ? 'btn-primary' : entry.coursesEntered ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {entry.submission?.status === 'declined' ? 'Resubmit →' : entry.coursesEntered ? 'Submit Grades →' : 'Set up courses →'}
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
                    {(!s.submission || s.submission.status === 'declined') && <DeadlineCountdown deadline={s.deadline} />}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge submission={s.submission} />
                  {(s.submission?.status === 'pending' || s.submission?.status === 'no_grade') && new Date(s.deadline) > new Date() && (
                    <WithdrawButton
                      submissionId={s.submission.id}
                      onWithdrawn={() => setLegacyActive(prev => prev.map(l => l.id === s.id ? { ...l, submission: null } : l))}
                    />
                  )}
                  {(!s.submission || s.submission.status === 'declined') && new Date(s.deadline) > new Date() && (
                    <Link href={`/submit/${s.id}`} className="btn-primary text-sm px-4 py-1.5 whitespace-nowrap">
                      {s.submission?.status === 'declined' ? 'Resubmit →' : 'Submit Grades →'}
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
          <p className="text-slate-400 text-sm mt-1">The VP of Academics & Scholarship hasn&apos;t opened a new round yet.</p>
          <p className="text-slate-500 text-xs mt-3">Questions? Email the VP of Academics & Scholarship: <a href="mailto:pktbb.academics@gmail.com" className="text-amber-400 hover:text-amber-300">pktbb.academics@gmail.com</a></p>
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
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {past.map((group, gi) => {
                    const multiRound = group.rounds.length > 1
                    return (
                      <>
                        {/* Semester header row — only when multiple rounds exist */}
                        {multiRound && (
                          <tr key={`hdr-${group.semesterId}`} className={`bg-slate-900/40 ${gi > 0 ? 'border-t border-slate-600' : 'border-b border-slate-700/50'}`}>
                            <td className="px-4 py-2.5">
                              <span className="text-white font-semibold">{group.semesterName}</span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {group.semesterGpa != null
                                ? <span className={`font-semibold ${gpaColorClass(group.semesterGpa)}`}>{group.semesterGpa.toFixed(2)}</span>
                                : <span className="text-slate-500">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="text-slate-500 text-xs">avg</span>
                            </td>
                            <td className="px-4 py-2.5" />
                          </tr>
                        )}
                        {/* Per-round rows */}
                        {group.rounds.map((entry, ri) => (
                          <tr key={`${entry.semesterId}-${entry.roundId ?? 'none'}`}
                            className={`border-b border-slate-700/50 last:border-0 ${!multiRound && gi > 0 ? 'border-t border-slate-600' : ''}`}>
                            <td className="px-4 py-3">
                              {multiRound ? (
                                <span className="text-slate-400 text-xs pl-3">↳ {entry.roundName}</span>
                              ) : (
                                <span className="text-white">{entry.semesterName}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {entry.submission?.final_gpa != null
                                ? <span className={`font-semibold ${gpaColorClass(entry.submission.final_gpa)}`}>{entry.submission.final_gpa.toFixed(2)}</span>
                                : <span className="text-slate-500">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <StatusBadge submission={entry.submission} />
                            </td>
                            <td className="px-4 py-3 text-amber-300 text-xs max-w-xs">{entry.submission?.admin_notes ?? <span className="text-slate-600">—</span>}</td>
                          </tr>
                        ))}
                      </>
                    )
                  })}
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

  // Past (inactive) semesters for history — expanded per round if rounds exist
  const pastSems = (semesters ?? [])
    .filter((s: any) => !s.is_active)
    .filter((s: any) => !s.required_years?.length || s.required_years.includes(memberYear))

  const pastSemesterIds = pastSems.map((s: any) => s.id)
  const { data: pastRoundsRaw } = pastSemesterIds.length > 0
    ? await supabase.from('semester_rounds').select('*').in('semester_id', pastSemesterIds).order('round_number', { ascending: true })
    : { data: [] }

  const pastRoundsBySemId = new Map<string, any[]>()
  for (const r of pastRoundsRaw ?? []) {
    if (!pastRoundsBySemId.has(r.semester_id)) pastRoundsBySemId.set(r.semester_id, [])
    pastRoundsBySemId.get(r.semester_id)!.push(r)
  }

  const past: PastSemesterGroup[] = pastSems.map(s => {
    const semRounds = pastRoundsBySemId.get(s.id) ?? []
    const entries: PastEntry[] = semRounds.length > 0
      ? semRounds.map(r => {
          const sub = (submissions ?? []).find((sub: any) => sub.round_id === r.id) ?? null
          return { semesterId: s.id, semesterName: s.name, roundId: r.id, roundName: r.name, submission: sub }
        })
      : [{
          semesterId: s.id, semesterName: s.name, roundId: null, roundName: null,
          submission: (submissions ?? [])
            .filter((sub: any) => sub.semester_id === s.id)
            .sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0] ?? null,
        }]
    const gpas = entries.map(e => e.submission?.final_gpa).filter((g): g is number => g != null)
    const semesterGpa = gpas.length > 0 ? gpas.reduce((a, b) => a + b, 0) / gpas.length : null
    return { semesterId: s.id, semesterName: s.name, semesterGpa, rounds: entries }
  })

  // At-risk check: compare latest reviewed GPA against chapter threshold
  let isAtRisk = false
  let gpaThreshold = 2.5
  try {
    const { supabaseAdmin: admin } = await import('@/lib/supabaseAdmin')
    const { data: settings } = await (admin.from('chapter_settings' as any).select('gpa_threshold').maybeSingle())
    gpaThreshold = (settings as any)?.gpa_threshold ?? 2.5
    const latestReviewed = (submissions ?? [])
      .filter((s: any) => s.final_gpa != null)
      .sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0]
    if (latestReviewed && latestReviewed.final_gpa < gpaThreshold) isAtRisk = true
  } catch {}

  return { props: { profile, activeRounds, legacyActive, past, isAtRisk, gpaThreshold } }
}
