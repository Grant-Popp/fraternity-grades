import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import Link from 'next/link'
import { gpaColorClass } from '@/lib/gpa'
import { useState } from 'react'

interface AtRiskMember { id: string; name: string; gpa: number }

interface Stats {
  totalMembers: number
  activeSubmissions: number
  pendingReview: number
  dropAlerts: number
  chapterGpa: number | null
  reviewedCount: number
  byYear: Record<string, { count: number; avg: number | null }>
  byMajor: { major: string; count: number; avg: number | null }[]
  activeSemester: { id: string; name: string; deadline: string; submitted: number; total: number; complianceRate: number } | null
  gpaThreshold: number
  atRiskMembers: AtRiskMember[]
  totalStrikes: number
}

export default function AdminDashboard({ stats }: { stats: Stats }) {
  const submitRate = stats.activeSemester
    ? Math.round((stats.activeSemester.submitted / Math.max(stats.activeSemester.total, 1)) * 100)
    : null

  const [threshold, setThreshold] = useState(stats.gpaThreshold.toString())
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const saveThreshold = async () => {
    const val = parseFloat(threshold)
    if (isNaN(val) || val < 0 || val > 4.0) return
    setSavingThreshold(true)
    await fetch('/api/settings/gpa-threshold', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold: val }),
    })
    setSavingThreshold(false)
  }

  const sendAtRiskEmail = async () => {
    if (!stats.activeSemester || stats.atRiskMembers.length === 0) return
    setSendingEmail(true)
    await fetch('/api/email/send-at-risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        semesterId: stats.activeSemester.id,
        threshold: parseFloat(threshold) || stats.gpaThreshold,
        atRiskMembers: stats.atRiskMembers,
      }),
    })
    setSendingEmail(false)
    setEmailSent(true)
  }

  return (
    <AdminLayout title="Dashboard">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total Members', value: stats.totalMembers, icon: '👥', note: null },
          { label: 'Pending Review', value: stats.pendingReview, icon: '📋', alert: stats.pendingReview > 0, note: stats.dropAlerts > 0 ? `${stats.dropAlerts} drop alert${stats.dropAlerts !== 1 ? 's' : ''}` : null },
          { label: 'Chapter GPA', value: stats.chapterGpa ? stats.chapterGpa.toFixed(2) : '—', icon: '📊', gpa: stats.chapterGpa, note: stats.chapterGpa ? `${stats.reviewedCount} submitted grades` : null },
          { label: 'Active Semester', value: stats.activeSemester?.name ?? 'None', icon: '📅', small: true, note: null },
          { label: 'Total Strikes', value: stats.totalStrikes, icon: '⚡', alert: stats.totalStrikes > 0, note: stats.totalStrikes > 0 ? 'across all members' : null },
        ].map(s => (
          <div key={s.label} className={`card !p-4 ${s.alert ? 'border-amber-500' : ''}`}>
            <p className="text-2xl mb-1">{s.icon}</p>
            <p className={`text-2xl font-bold ${s.gpa != null ? gpaColorClass(s.gpa) : 'text-white'} ${s.small ? 'text-base' : ''}`}>
              {String(s.value)}
            </p>
            <p className="text-slate-400 text-xs mt-1">{s.label}</p>
            {s.note && <p className="text-slate-500 text-xs mt-0.5">{s.note}</p>}
          </div>
        ))}
      </div>

      {/* Active semester progress */}
      {stats.activeSemester && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white">Current Semester — {stats.activeSemester.name}</h2>
            <Link href="/admin/submissions" className="text-amber-400 text-sm hover:text-amber-300">View all →</Link>
          </div>
          <div className="flex items-center gap-4 mb-2">
            <div className="flex-1 bg-slate-700 rounded-full h-3">
              <div className="bg-amber-500 h-3 rounded-full transition-all" style={{ width: `${submitRate ?? 0}%` }} />
            </div>
            <span className="text-white font-semibold text-sm shrink-0">
              {stats.activeSemester.submitted}/{stats.activeSemester.total} ({submitRate}%)
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <p className="text-slate-400">Deadline: {new Date(stats.activeSemester.deadline).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
            <p className="text-slate-500">
              Compliance rate: <span className={`font-semibold ${stats.activeSemester.complianceRate >= 80 ? 'text-green-400' : stats.activeSemester.complianceRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.activeSemester.complianceRate}%</span>
            </p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* By class year */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Average GPA by Class Year</h2>
          <div className="space-y-3">
            {['Freshman','Sophomore','Junior','Senior'].map(yr => {
              const d = stats.byYear[yr]
              return (
                <div key={yr} className="flex items-center justify-between">
                  <span className="text-slate-300 text-sm">{yr}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-xs">{d?.count ?? 0} members</span>
                    <span className={`font-semibold ${d?.avg != null ? gpaColorClass(d.avg) : 'text-slate-500'}`}>
                      {d?.avg != null ? d.avg.toFixed(2) : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By major */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Average GPA by Major</h2>
          {stats.byMajor.length === 0 ? (
            <p className="text-slate-400 text-sm">No major data yet — members will enter this on signup.</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {stats.byMajor.map(m => (
                <div key={m.major} className="flex items-center justify-between">
                  <span className="text-slate-300 text-sm truncate mr-3">{m.major}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-slate-400 text-xs">{m.count}</span>
                    <span className={`font-semibold ${m.avg != null ? gpaColorClass(m.avg) : 'text-slate-500'}`}>
                      {m.avg != null ? m.avg.toFixed(2) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* At-risk members */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-white">At-Risk Members</h2>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs">GPA threshold:</span>
            <input
              type="number"
              min="0"
              max="4.0"
              step="0.1"
              className="input !py-1 !px-2 !text-xs w-16"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
            />
            <button onClick={saveThreshold} disabled={savingThreshold} className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded transition-colors">
              {savingThreshold ? '…' : 'Set'}
            </button>
          </div>
        </div>
        {stats.atRiskMembers.length === 0 ? (
          <p className="text-slate-400 text-sm">No members currently below the {stats.gpaThreshold.toFixed(2)} GPA threshold.</p>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {stats.atRiskMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-900/10 border border-red-800/30">
                  <Link href={`/admin/members/${m.id}`} className="text-white text-sm hover:text-amber-400">{m.name}</Link>
                  <span className={`font-semibold text-sm ${gpaColorClass(m.gpa)}`}>{m.gpa.toFixed(2)}</span>
                </div>
              ))}
            </div>
            {stats.activeSemester && (
              <button
                onClick={sendAtRiskEmail}
                disabled={sendingEmail || emailSent}
                className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-60"
              >
                {emailSent ? '✓ Email sent' : sendingEmail ? 'Sending…' : 'Email me this summary'}
              </button>
            )}
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div /> {/* spacer */}
        {/* Quick actions */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { href: '/admin/submissions', label: `Review ${stats.pendingReview} pending submissions`, icon: '📋', primary: stats.pendingReview > 0 },
              { href: '/admin/semesters', label: 'Manage semesters & deadlines', icon: '📅', primary: false },
              { href: '/admin/export', label: 'Export grades to Excel', icon: '📥', primary: false },
              { href: '/admin/members', label: 'View all members', icon: '👥', primary: false },
            ].map(a => (
              <Link key={a.href} href={a.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  a.primary ? 'bg-amber-500 text-slate-900 font-semibold hover:bg-amber-400' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                }`}>
                <span>{a.icon}</span>{a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect, supabase } = await requireAdmin(ctx)
  if (redirect) return { redirect }

  const { data: members } = await supabase.from('profiles').select('id,full_name,class_year,major,strikes').eq('role', 'member')
  const { data: semesters } = await supabase.from('semesters').select('*').eq('is_active', true).order('created_at', { ascending: false })
  const { data: submissions } = await supabase.from('submissions').select('*')

  const activeSem = semesters?.[0] ?? null
  const { data: dropAlertsData } = await supabase.from('drop_alerts').select('id').eq('acknowledged', false)

  const totalMembers = members?.length ?? 0
  const pendingReview = (submissions ?? []).filter(s => s.status === 'pending' && !s.no_grade).length
  const dropAlerts = dropAlertsData?.length ?? 0
  const reviewed = (submissions ?? []).filter(s => s.final_gpa != null)
  const chapterGpa = reviewed.length ? reviewed.reduce((a, b) => a + (b.final_gpa ?? 0), 0) / reviewed.length : null

  const byYear: Record<string, { count: number; avg: number | null }> = {}
  for (const yr of ['Freshman','Sophomore','Junior','Senior']) {
    const yrMembers = (members ?? []).filter(m => m.class_year === yr)
    const yrSubs = (submissions ?? []).filter(s => yrMembers.some(m => m.id === s.member_id) && s.final_gpa != null)
    byYear[yr] = {
      count: yrMembers.length,
      avg: yrSubs.length ? yrSubs.reduce((a, b) => a + (b.final_gpa ?? 0), 0) / yrSubs.length : null,
    }
  }

  // Group by major
  const majorMap: Record<string, { ids: string[] }> = {}
  for (const m of members ?? []) {
    const key = m.major?.trim() || null
    if (!key) continue
    if (!majorMap[key]) majorMap[key] = { ids: [] }
    majorMap[key].ids.push(m.id)
  }
  const byMajor = Object.entries(majorMap).map(([major, { ids }]) => {
    const subs = (submissions ?? []).filter(s => ids.includes(s.member_id) && s.final_gpa != null)
    return {
      major,
      count: ids.length,
      avg: subs.length ? subs.reduce((a, b) => a + (b.final_gpa ?? 0), 0) / subs.length : null,
    }
  }).sort((a, b) => a.major.localeCompare(b.major))

  const activeSemSubmitted = activeSem ? (submissions ?? []).filter(s => s.semester_id === activeSem.id).length : 0
  const activeSemesterData = activeSem ? {
    id: activeSem.id, name: activeSem.name, deadline: activeSem.deadline,
    submitted: activeSemSubmitted,
    total: totalMembers,
    complianceRate: totalMembers > 0 ? Math.round((activeSemSubmitted / totalMembers) * 100) : 0,
  } : null

  const totalStrikes = (members ?? []).reduce((sum: number, m: any) => sum + (m.strikes ?? 0), 0)

  // Load GPA threshold
  let gpaThreshold = 2.5
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin')
    const { data: settings } = await (supabaseAdmin.from('chapter_settings' as any).select('gpa_threshold').maybeSingle())
    gpaThreshold = (settings as any)?.gpa_threshold ?? 2.5
  } catch {}

  // Compute at-risk members: latest reviewed GPA below threshold
  const atRiskMembers: AtRiskMember[] = (members ?? []).flatMap(m => {
    const memberSubs = (submissions ?? [])
      .filter((s: any) => s.member_id === m.id && s.final_gpa != null)
      .sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    const latest = memberSubs[0]
    if (!latest || latest.final_gpa >= gpaThreshold) return []
    return [{ id: m.id, name: (m as any).full_name ?? 'Unknown', gpa: latest.final_gpa }]
  }).sort((a, b) => a.gpa - b.gpa)

  return { props: { stats: { totalMembers, activeSubmissions: 0, pendingReview, dropAlerts, chapterGpa, reviewedCount: reviewed.length, byYear, byMajor, activeSemester: activeSemesterData, gpaThreshold, atRiskMembers, totalStrikes } } }
}
