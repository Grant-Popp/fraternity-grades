import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import Link from 'next/link'
import { gpaColorClass } from '@/lib/gpa'

interface Stats {
  totalMembers: number
  activeSubmissions: number
  pendingReview: number
  chapterGpa: number | null
  byYear: Record<string, { count: number; avg: number | null }>
  activeSemester: { id: string; name: string; deadline: string; submitted: number; total: number } | null
}

export default function AdminDashboard({ stats }: { stats: Stats }) {
  const submitRate = stats.activeSemester
    ? Math.round((stats.activeSemester.submitted / Math.max(stats.activeSemester.total, 1)) * 100)
    : null

  return (
    <AdminLayout title="Dashboard">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Members', value: stats.totalMembers, icon: '👥' },
          { label: 'Pending Review', value: stats.pendingReview, icon: '📋', alert: stats.pendingReview > 0 },
          { label: 'Chapter GPA', value: stats.chapterGpa ? stats.chapterGpa.toFixed(2) : '—', icon: '📊', gpa: stats.chapterGpa },
          { label: 'Active Semester', value: stats.activeSemester?.name ?? 'None', icon: '📅', small: true },
        ].map(s => (
          <div key={s.label} className={`card !p-4 ${s.alert ? 'border-amber-500' : ''}`}>
            <p className="text-2xl mb-1">{s.icon}</p>
            <p className={`text-2xl font-bold ${s.gpa != null ? gpaColorClass(s.gpa) : 'text-white'} ${s.small ? 'text-base' : ''}`}>
              {String(s.value)}
            </p>
            <p className="text-slate-400 text-xs mt-1">{s.label}</p>
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
          <p className="text-slate-400 text-xs">Deadline: {new Date(stats.activeSemester.deadline).toLocaleString()}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
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

  const { data: members } = await supabase.from('profiles').select('id,class_year').eq('role', 'member')
  const { data: semesters } = await supabase.from('semesters').select('*').eq('is_active', true).order('created_at', { ascending: false })
  const { data: submissions } = await supabase.from('submissions').select('*')

  const activeSem = semesters?.[0] ?? null
  const totalMembers = members?.length ?? 0
  const pendingReview = (submissions ?? []).filter(s => s.status === 'pending' && !s.no_grade).length
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

  const activeSemesterData = activeSem ? {
    id: activeSem.id, name: activeSem.name, deadline: activeSem.deadline,
    submitted: (submissions ?? []).filter(s => s.semester_id === activeSem.id).length,
    total: totalMembers,
  } : null

  return { props: { stats: { totalMembers, activeSubmissions: 0, pendingReview, chapterGpa, byYear, activeSemester: activeSemesterData } } }
}
