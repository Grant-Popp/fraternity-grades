import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import { gpaColorClass } from '@/lib/gpa'
import Link from 'next/link'

interface MemberRow {
  id: string
  name: string
  classYear: string
  status: 'reviewed' | 'pending' | 'no_grade' | 'declined' | 'not_submitted' | 'not_required'
  gpa: number | null
  deadlineStrikes: number
}

interface ActiveInfo {
  semesterName: string
  roundName: string | null
  deadline: string | null
}

interface Props {
  rows: MemberRow[]
  activeInfo: ActiveInfo | null
  submittedCount: number
  requiredCount: number
}

function StatusBadge({ status }: { status: MemberRow['status'] }) {
  switch (status) {
    case 'reviewed':      return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-900/40 text-green-400">Reviewed ✓</span>
    case 'pending':       return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400">Pending Review</span>
    case 'no_grade':      return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400">No Grade</span>
    case 'declined':      return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400">Declined</span>
    case 'not_submitted': return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Not Submitted</span>
    case 'not_required':  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-600">Not Required</span>
  }
}

function StrikesBadge({ n }: { n: number }) {
  if (n === 0) return <span className="text-green-400 font-semibold text-sm">0</span>
  if (n === 1) return <span className="text-yellow-400 font-semibold text-sm">1</span>
  return <span className="text-red-400 font-semibold text-sm">{n}</span>
}

const STATUS_ORDER: Record<MemberRow['status'], number> = {
  declined: 0, not_submitted: 1, pending: 2, no_grade: 3, reviewed: 4, not_required: 5,
}

export default function CompliancePage({ rows, activeInfo, submittedCount, requiredCount }: Props) {
  const sorted = [...rows].sort((a, b) => {
    const sd = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (sd !== 0) return sd
    return b.deadlineStrikes - a.deadlineStrikes
  })

  const rate = requiredCount > 0 ? Math.round((submittedCount / requiredCount) * 100) : 0

  return (
    <AdminLayout title="Compliance Board">
      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card !p-4">
          <p className="text-slate-400 text-xs mb-1">Active Round</p>
          <p className="text-white font-semibold text-sm truncate">
            {activeInfo ? `${activeInfo.semesterName}${activeInfo.roundName ? ` · ${activeInfo.roundName}` : ''}` : 'None open'}
          </p>
          {activeInfo?.deadline && (
            <p className="text-slate-500 text-xs mt-0.5">
              Due {new Date(activeInfo.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>
        <div className="card !p-4">
          <p className="text-slate-400 text-xs mb-1">Submitted</p>
          <p className="text-white font-bold text-xl">{submittedCount}<span className="text-slate-500 text-sm font-normal">/{requiredCount}</span></p>
        </div>
        <div className="card !p-4">
          <p className="text-slate-400 text-xs mb-1">Compliance Rate</p>
          <p className={`font-bold text-xl ${rate >= 80 ? 'text-green-400' : rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{activeInfo ? `${rate}%` : '—'}</p>
        </div>
        <div className="card !p-4">
          <p className="text-slate-400 text-xs mb-1">Still Needed</p>
          <p className={`font-bold text-xl ${requiredCount - submittedCount === 0 ? 'text-green-400' : 'text-red-400'}`}>
            {activeInfo ? requiredCount - submittedCount : '—'}
          </p>
        </div>
      </div>

      {/* Compliance progress bar */}
      {activeInfo && (
        <div className="card mb-6 !py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-700 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${rate}%` }}
              />
            </div>
            <span className="text-slate-300 text-xs shrink-0 font-medium">{rate}% compliant</span>
          </div>
        </div>
      )}

      {/* Member table */}
      <div className="card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Member</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Year</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">GPA</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium" title="Rounds missed at deadline (auto-computed)">Deadline Strikes</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr key={row.id} className={`border-b border-slate-700/50 last:border-0 transition-colors hover:bg-slate-800/30 ${row.status === 'not_submitted' || row.status === 'declined' ? 'bg-red-900/5' : ''}`}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/members/${row.id}`} className="text-white hover:text-amber-400 transition-colors font-medium">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{row.classYear}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.gpa != null
                      ? <span className={`font-semibold ${gpaColorClass(row.gpa)}`}>{row.gpa.toFixed(2)}</span>
                      : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StrikesBadge n={row.deadlineStrikes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/30">
          <p className="text-slate-600 text-xs">Deadline strikes = rounds closed without a valid submission. Does not include the current open round.</p>
        </div>
      </div>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect } = await requireAdmin(ctx)
  if (redirect) return { redirect }

  const { supabaseAdmin } = await import('@/lib/supabaseAdmin')

  const [
    { data: members },
    { data: activeSems },
    { data: allRounds },
    { data: allSemesters },
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, full_name, class_year').eq('role', 'member').order('full_name'),
    supabaseAdmin.from('semesters').select('id, name, required_years').eq('is_active', true).order('created_at', { ascending: false }).limit(1),
    supabaseAdmin.from('semester_rounds').select('id, semester_id, is_active, deadline, round_number'),
    supabaseAdmin.from('semesters').select('id, required_years'),
  ])

  const activeSem = activeSems?.[0] ?? null

  // Find the current open round for the active semester (highest round_number among active rounds)
  const openRounds = (allRounds ?? []).filter(r => r.semester_id === activeSem?.id && r.is_active)
  const activeRound = openRounds.sort((a, b) => b.round_number - a.round_number)[0] ?? null

  // Fetch current round submissions
  let currentSubs: any[] = []
  if (activeSem) {
    const q = activeRound
      ? supabaseAdmin.from('submissions').select('member_id, status, final_gpa').eq('semester_id', activeSem.id).eq('round_id', activeRound.id)
      : supabaseAdmin.from('submissions').select('member_id, status, final_gpa').eq('semester_id', activeSem.id).is('round_id', null)
    const { data } = await q
    currentSubs = data ?? []
  }

  // Deadline strikes: closed rounds (not active, deadline passed) → member had no valid submission
  const semMap = new Map((allSemesters ?? []).map((s: any) => [s.id, s]))
  const closedRounds = (allRounds ?? []).filter(r => !r.is_active && new Date(r.deadline) < new Date())
  const closedIds = closedRounds.map(r => r.id)

  let pastSubs: any[] = []
  if (closedIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('submissions')
      .select('member_id, round_id, status')
      .in('round_id', closedIds)
      .neq('status', 'declined')
    pastSubs = data ?? []
  }

  // Build set: roundId → Set of memberIds who submitted validly
  const validByRound = new Map<string, Set<string>>()
  for (const s of pastSubs) {
    if (!validByRound.has(s.round_id)) validByRound.set(s.round_id, new Set())
    validByRound.get(s.round_id)!.add(s.member_id)
  }

  // Compute per-member deadline strikes
  const strikeMap = new Map<string, number>()
  for (const m of members ?? []) {
    let strikes = 0
    for (const r of closedRounds) {
      const sem: any = semMap.get(r.semester_id)
      if (!sem) continue
      if (sem.required_years?.length && !sem.required_years.includes(m.class_year)) continue
      if (!validByRound.get(r.id)?.has(m.id)) strikes++
    }
    strikeMap.set(m.id, strikes)
  }

  // Build current-round status per member
  const subMap = new Map(currentSubs.map(s => [s.member_id, s]))
  const requiredMembers = activeSem?.required_years?.length
    ? (members ?? []).filter((m: any) => activeSem.required_years.includes(m.class_year))
    : (members ?? [])
  const requiredIds = new Set(requiredMembers.map((m: any) => m.id))

  const rows: MemberRow[] = (members ?? []).map((m: any) => {
    const sub = subMap.get(m.id)
    let status: MemberRow['status']
    if (!activeSem) {
      status = 'not_required'
    } else if (!requiredIds.has(m.id)) {
      status = 'not_required'
    } else if (!sub) {
      status = 'not_submitted'
    } else {
      status = sub.status as MemberRow['status']
    }
    return {
      id: m.id,
      name: m.full_name,
      classYear: m.class_year,
      status,
      gpa: sub?.final_gpa ?? null,
      deadlineStrikes: strikeMap.get(m.id) ?? 0,
    }
  })

  const submittedCount = requiredMembers.filter((m: any) => {
    const s = subMap.get(m.id)
    return s && s.status !== 'declined'
  }).length

  const activeInfo = activeSem ? {
    semesterName: activeSem.name,
    roundName: activeRound?.round_number != null ? `Round ${activeRound.round_number}` : null,
    deadline: activeRound?.deadline ?? null,
  } : null

  return {
    props: {
      rows,
      activeInfo,
      submittedCount,
      requiredCount: requiredMembers.length,
    },
  }
}
