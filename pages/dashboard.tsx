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
  roundNumber: number | null
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
          <p className="text-slate-400 text-xs">Class Year</p>
          <p className="text-white font-semibold text-xs sm:text-sm leading-tight mt-0.5">{profile.class_year}</p>
        </div>
        <div className="card !p-4">
          <p className="text-slate-400 text-xs">Submitted</p>
          <p className="text-white font-semibold text-sm sm:text-base mt-0.5">{submittedCount}</p>
        </div>
        <div className="card !p-4">
          <p className="text-slate-400 text-xs">Latest GPA</p>
          <p className="font-semibold text-sm sm:text-base flex items-center mt-0.5">
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
            {activeRounds.map(entry => {
              const submitted = !!entry.submission && entry.submission.status !== 'declined'
              const declined = entry.submission?.status === 'declined'
              const pastDeadline = new Date(entry.round.deadline) <= new Date()
              const accentColor = submitted ? 'border-l-green-500' : declined ? 'border-l-red-500' : 'border-l-amber-500'
              return (
                <div key={entry.round.id} className={`card border-l-4 ${accentColor} !pl-4`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-white">{entry.semesterName}</p>
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{entry.round.name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
                        <p className="text-slate-400 text-xs">
                          Due {new Date(entry.round.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        {!submitted && <DeadlineCountdown deadline={entry.round.deadline} />}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge submission={entry.submission} />
                      {(entry.submission?.status === 'pending' || entry.submission?.status === 'no_grade') && !pastDeadline && (
                        <WithdrawButton
                          submissionId={entry.submission.id}
                          onWithdrawn={() => setActiveRounds(prev => prev.map(r => r.round.id === entry.round.id ? { ...r, submission: null } : r))}
                        />
                      )}
                      {!submitted && !pastDeadline && (
                        <Link
                          href={`/submit/${entry.semesterId}`}
                          className={`text-sm px-4 py-1.5 whitespace-nowrap ${declined || entry.coursesEntered ? 'btn-primary' : 'btn-secondary'}`}
                        >
                          {declined ? 'Resubmit →' : entry.coursesEntered ? 'Submit Grades →' : 'Set up courses →'}
                        </Link>
                      )}
                    </div>
                  </div>
                  {entry.submission?.admin_notes && (
                    <p className="mt-2 text-xs text-amber-300 bg-amber-900/20 px-3 py-1.5 rounded-lg">
                      Note from VP: {entry.submission.admin_notes}
                    </p>
                  )}
                </div>
              )
            })}

            {/* Legacy active semesters (no rounds) */}
            {legacyActive.map(s => {
              const submitted = !!s.submission && s.submission.status !== 'declined'
              const declined = s.submission?.status === 'declined'
              const pastDeadline = new Date(s.deadline) <= new Date()
              const accentColor = submitted ? 'border-l-green-500' : declined ? 'border-l-red-500' : 'border-l-amber-500'
              return (
                <div key={s.id} className={`card border-l-4 ${accentColor} !pl-4`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white">{s.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
                        <p className="text-slate-400 text-xs">
                          Due {new Date(s.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        {!submitted && <DeadlineCountdown deadline={s.deadline} />}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge submission={s.submission} />
                      {(s.submission?.status === 'pending' || s.submission?.status === 'no_grade') && !pastDeadline && (
                        <WithdrawButton
                          submissionId={s.submission.id}
                          onWithdrawn={() => setLegacyActive(prev => prev.map(l => l.id === s.id ? { ...l, submission: null } : l))}
                        />
                      )}
                      {!submitted && !pastDeadline && (
                        <Link href={`/submit/${s.id}`} className="btn-primary text-sm px-4 py-1.5 whitespace-nowrap">
                          {declined ? 'Resubmit →' : 'Submit Grades →'}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

          </div>
        </section>
      )}

      {!hasOpen && (
        <div className="card text-center py-10 mb-8">
          <p className="text-3xl mb-3">📭</p>
          <p className="text-white font-semibold">No open submissions</p>
          <p className="text-slate-400 text-sm mt-1">The VP of Academics hasn&apos;t opened a new round yet.</p>
          <p className="text-slate-500 text-xs mt-3">
            Questions? <a href="mailto:pktbb.academics@gmail.com" className="text-amber-400 hover:text-amber-300">pktbb.academics@gmail.com</a>
          </p>
        </div>
      )}

      {/* Past history */}
      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Past Semesters</h2>
          <div className="space-y-3">
            {past.map((group) => {
              const multiRound = group.rounds.length > 1
              const anyDeclined = group.rounds.some(r => r.submission?.status === 'declined')
              const allDone = group.rounds.every(r => r.submission?.status === 'reviewed' || r.submission?.status === 'no_grade')
              const accentColor = anyDeclined ? 'border-l-red-500' : allDone ? 'border-l-green-500' : 'border-l-slate-600'
              return (
                <div key={group.semesterId} className={`card border-l-4 ${accentColor} !pl-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white">{group.semesterName}</p>
                      {multiRound && group.semesterGpa != null && (
                        <p className="text-slate-400 text-xs mt-0.5">
                          Avg GPA: <span className={`font-semibold ${gpaColorClass(group.semesterGpa)}`}>{group.semesterGpa.toFixed(2)}</span>
                        </p>
                      )}
                    </div>
                    {!multiRound && (
                      <div className="flex items-center gap-3 shrink-0">
                        {group.rounds[0]?.submission?.final_gpa != null && (
                          <span className={`font-semibold text-sm ${gpaColorClass(group.rounds[0].submission.final_gpa)}`}>
                            {group.rounds[0].submission.final_gpa.toFixed(2)}
                          </span>
                        )}
                        <StatusBadge submission={group.rounds[0]?.submission ?? null} />
                      </div>
                    )}
                  </div>
                  {!multiRound && group.rounds[0]?.submission?.admin_notes && (
                    <p className="mt-2 text-xs text-amber-300 bg-amber-900/20 px-3 py-1.5 rounded-lg">
                      Note from VP: {group.rounds[0].submission.admin_notes}
                    </p>
                  )}
                  {multiRound && (
                    <div className="mt-3 space-y-2">
                      {group.rounds.map((entry) => (
                        <div key={entry.roundId ?? entry.semesterId} className="flex items-center gap-3 pl-3 border-l border-slate-700">
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-300 text-sm">{entry.roundName}</p>
                            {entry.submission?.admin_notes && (
                              <p className="text-xs text-amber-300 mt-0.5">{entry.submission.admin_notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {entry.submission?.final_gpa != null ? (
                              <span className={`font-semibold text-sm ${gpaColorClass(entry.submission.final_gpa)}`}>
                                {entry.submission.final_gpa.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-sm">—</span>
                            )}
                            <StatusBadge submission={entry.submission} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
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

  const { supabaseAdmin: admin } = await import('@/lib/supabaseAdmin')

  const [
    { data: semesters },
    { data: activeRoundsRaw },
    { data: submissions },
    { data: courseRows },
  ] = await Promise.all([
    supabase.from('semesters').select('*').order('created_at', { ascending: false }),
    admin.from('semester_rounds').select('*').eq('is_active', true).order('round_number', { ascending: false }),
    supabase.from('submissions').select('*').eq('member_id', session!.user.id),
    supabase.from('member_courses').select('semester_id').eq('member_id', session!.user.id),
  ])

  const semMap = new Map((semesters ?? []).map(s => [s.id, s]))
  const subByRoundId = new Map((submissions ?? []).filter((s: any) => s.round_id).map((s: any) => [s.round_id!, s]))
  const subBySemId = new Map((submissions ?? []).filter((s: any) => !s.round_id).map((s: any) => [s.semester_id, s]))
  const coursesEnteredFor = new Set((courseRows ?? []).map((c: any) => c.semester_id))

  // Active rounds — reviewed submissions move to Past Semesters; only latest
  // non-reviewed round per semester shown (robust against multiple open rounds)
  const roundSemesterIds = new Set<string>()
  const reviewedActiveEntries: PastEntry[] = []
  const activeRounds: ActiveRoundEntry[] = []
  const activeRoundSemIds = new Set<string>()

  for (const r of (activeRoundsRaw ?? [])) {
    const sem = semMap.get(r.semester_id)
    if (!sem) continue
    if (sem.required_years?.length && !sem.required_years.includes(memberYear)) continue
    roundSemesterIds.add(r.semester_id)

    const sub = subByRoundId.get(r.id) ?? null

    if (sub?.status === 'reviewed' || sub?.status === 'no_grade') {
      reviewedActiveEntries.push({
        semesterId: r.semester_id,
        semesterName: sem.name,
        roundId: r.id,
        roundName: r.name,
        roundNumber: r.round_number ?? null,
        submission: sub,
      })
      continue
    }

    if (!activeRoundSemIds.has(r.semester_id)) {
      activeRoundSemIds.add(r.semester_id)
      activeRounds.push({
        round: r,
        semesterName: sem.name,
        semesterId: r.semester_id,
        submission: sub,
        coursesEntered: coursesEnteredFor.has(r.semester_id),
      })
    }
  }

  // Active semesters with no rounds yet (legacy flow)
  const legacyActive = (semesters ?? [])
    .filter((s: any) => s.is_active && !roundSemesterIds.has(s.id))
    .filter((s: any) => !s.required_years?.length || s.required_years.includes(memberYear))
    .map((s: any) => ({ ...s, submission: subBySemId.get(s.id) ?? null }))

  // Past (inactive) semesters for history — exclude any semester that has an active round
  const pastSems = (semesters ?? [])
    .filter((s: any) => !s.is_active && !roundSemesterIds.has(s.id))
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

  const pastFromInactive: PastSemesterGroup[] = pastSems.map(s => {
    const semRounds = pastRoundsBySemId.get(s.id) ?? []
    const entries: PastEntry[] = semRounds.length > 0
      ? semRounds.map(r => {
          const sub = (submissions ?? []).find((sub: any) => sub.round_id === r.id) ?? null
          return { semesterId: s.id, semesterName: s.name, roundId: r.id, roundName: r.name, roundNumber: r.round_number ?? null, submission: sub }
        })
      : [{
          semesterId: s.id, semesterName: s.name, roundId: null, roundName: null, roundNumber: null,
          submission: (submissions ?? [])
            .filter((sub: any) => sub.semester_id === s.id)
            .sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0] ?? null,
        }]
    const gpas = entries.map(e => e.submission?.final_gpa).filter((g): g is number => g != null)
    const semesterGpa = gpas.length > 0 ? gpas.reduce((a, b) => a + b, 0) / gpas.length : null
    return { semesterId: s.id, semesterName: s.name, semesterGpa, rounds: entries }
  })

  // Group reviewed active rounds by semester and prepend to past
  const reviewedBySemId = new Map<string, PastEntry[]>()
  for (const entry of reviewedActiveEntries) {
    if (!reviewedBySemId.has(entry.semesterId)) reviewedBySemId.set(entry.semesterId, [])
    reviewedBySemId.get(entry.semesterId)!.push(entry)
  }
  Array.from(reviewedBySemId.values()).forEach(entries => {
    entries.sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))
  })
  const reviewedPastGroups: PastSemesterGroup[] = Array.from(reviewedBySemId.entries()).map(([semId, entries]) => {
    const gpas = entries.map(e => e.submission?.final_gpa).filter((g): g is number => g != null)
    const semesterGpa = gpas.length > 0 ? gpas.reduce((a, b) => a + b, 0) / gpas.length : null
    return { semesterId: semId, semesterName: entries[0].semesterName, semesterGpa, rounds: entries }
  })

  const past = [...reviewedPastGroups, ...pastFromInactive]

  // At-risk check: compare latest reviewed GPA against chapter threshold
  let isAtRisk = false
  let gpaThreshold = 2.5
  try {
    const { data: settings } = await (admin.from('chapter_settings' as any).select('gpa_threshold').maybeSingle())
    gpaThreshold = (settings as any)?.gpa_threshold ?? 2.5
    const latestReviewed = (submissions ?? [])
      .filter((s: any) => s.final_gpa != null)
      .sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0]
    if (latestReviewed && latestReviewed.final_gpa < gpaThreshold) isAtRisk = true
  } catch {}

  return { props: { profile, activeRounds, legacyActive, past, isAtRisk, gpaThreshold } }
}
