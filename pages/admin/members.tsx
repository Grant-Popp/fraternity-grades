import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import { useState } from 'react'
import type { Profile } from '@/lib/database.types'

interface MemberRow extends Profile {
  submissionCount: number
  latestGpa: number | null
}

export default function MembersPage({ members: initial }: { members: MemberRow[] }) {
  const [members, setMembers] = useState(initial)
  const [search, setSearch] = useState('')
  const [filterYear, setFilterYear] = useState('all')
  const [savingId, setSavingId] = useState<string | null>(null)

  const filtered = members.filter(m => {
    if (search && !m.full_name.toLowerCase().includes(search.toLowerCase()) && !m.email.toLowerCase().includes(search.toLowerCase())) return false
    if (filterYear !== 'all' && m.class_year !== filterYear) return false
    return true
  })

  const toggleRole = async (m: MemberRow) => {
    const newRole = m.role === 'admin' ? 'member' : 'admin'
    setSavingId(m.id)
    const res = await fetch('/api/members/update-role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: m.id, role: newRole }),
    })
    if (res.ok) {
      setMembers(prev => prev.map(p => p.id === m.id ? { ...p, role: newRole } : p))
    }
    setSavingId(null)
  }

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
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/60 border-b border-slate-700">
              {['Name','Email','Class Year','Major','Submissions','Latest GPA','Role','Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className="border-b border-slate-700/50 hover:bg-slate-700/10">
                <td className="px-4 py-3 text-white font-medium">{m.full_name}</td>
                <td className="px-4 py-3 text-slate-400">{m.email}</td>
                <td className="px-4 py-3 text-slate-300">{m.class_year}</td>
                <td className="px-4 py-3 text-slate-400">{m.major ?? '—'}</td>
                <td className="px-4 py-3 text-center text-slate-300">{m.submissionCount}</td>
                <td className="px-4 py-3 text-center">
                  {m.latestGpa != null
                    ? <span className={`font-semibold ${m.latestGpa >= 3.0 ? 'text-green-400' : m.latestGpa >= 2.0 ? 'text-yellow-400' : 'text-red-400'}`}>{m.latestGpa.toFixed(2)}</span>
                    : <span className="text-slate-500">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${m.role === 'admin' ? 'bg-amber-900 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>
                    {m.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleRole(m)}
                    disabled={savingId === m.id}
                    className="text-xs text-slate-400 hover:text-amber-400 transition-colors disabled:opacity-50"
                  >
                    {savingId === m.id ? '…' : m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-slate-400 py-10">No members found.</p>
        )}
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
    }
  })

  return { props: { members } }
}
