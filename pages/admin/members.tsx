import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import Link from 'next/link'
import { useState } from 'react'
import type { Profile } from '@/lib/database.types'

interface MemberRow extends Profile {
  submissionCount: number
  latestGpa: number | null
  strikes: number
}

export default function MembersPage({ members: initial }: { members: MemberRow[] }) {
  const [members] = useState(initial)
  const [search, setSearch] = useState('')
  const [filterYear, setFilterYear] = useState('all')

  const filtered = members.filter(m => {
    if (search && !m.full_name.toLowerCase().includes(search.toLowerCase()) && !m.email.toLowerCase().includes(search.toLowerCase())) return false
    if (filterYear !== 'all' && m.class_year !== filterYear) return false
    return true
  })

  return (
    <AdminLayout title="Members">
      <div className="flex flex-wrap gap-3 mb-4">
        <input className="input !w-64" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input !w-auto" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
          <option value="all">All Years</option>
          {['Freshman','Sophomore','Junior','Senior'].map(yr => <option key={yr}>{yr}</option>)}
        </select>
        <span className="text-slate-400 text-sm self-center">{filtered.length} members</span>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/60 border-b border-slate-700">
              {['Name','Email','Year','Major','Submissions','Latest GPA','Strikes','Role',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className="border-b border-slate-700/50 hover:bg-slate-700/10">
                <td className="px-4 py-3 text-white font-medium">{m.full_name}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{m.email}</td>
                <td className="px-4 py-3 text-slate-300">{m.class_year}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{m.major ?? '—'}</td>
                <td className="px-4 py-3 text-center text-slate-300">{m.submissionCount}</td>
                <td className="px-4 py-3 text-center">
                  {m.latestGpa != null
                    ? <span className={`font-semibold ${m.latestGpa >= 3.0 ? 'text-green-400' : m.latestGpa >= 2.0 ? 'text-yellow-400' : 'text-red-400'}`}>{m.latestGpa.toFixed(2)}</span>
                    : <span className="text-slate-500">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {m.strikes > 0
                    ? <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${m.strikes >= 3 ? 'text-red-400 bg-red-900/30' : m.strikes === 2 ? 'text-orange-400 bg-orange-900/20' : 'text-yellow-400 bg-yellow-900/20'}`}>
                        {m.strikes}
                      </span>
                    : <span className="text-slate-600 text-xs">0</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${m.role === 'admin' ? 'bg-amber-900 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>
                    {m.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/members/${m.id}`} className="text-xs border border-slate-600 hover:border-amber-500 text-slate-300 hover:text-amber-400 px-2.5 py-1 rounded transition-colors whitespace-nowrap">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-slate-400 py-10">No members found.</p>
        )}
        </div>
      </div>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect } = await requireAdmin(ctx)
  if (redirect) return { redirect }

  const { supabaseAdmin } = await import('@/lib/supabaseAdmin')
  const { data: profiles } = await supabaseAdmin.from('profiles').select('*').order('full_name')
  const { data: submissions } = await supabaseAdmin.from('submissions').select('member_id,final_gpa,submitted_at').order('submitted_at', { ascending: false })

  const members: MemberRow[] = (profiles ?? []).map(p => {
    const subs = (submissions ?? []).filter(s => s.member_id === p.id)
    const latestSub = subs.find(s => s.final_gpa != null)
    return {
      ...p,
      submissionCount: subs.length,
      latestGpa: latestSub?.final_gpa ?? null,
      strikes: (p as any).strikes ?? 0,
    }
  })

  return { props: { members } }
}
