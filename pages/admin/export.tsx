import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import { useState } from 'react'
import type { Semester } from '@/lib/database.types'

export default function ExportPage({ semesters }: { semesters: Semester[] }) {
  const [selectedSem, setSelectedSem] = useState(semesters[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleExport = async () => {
    if (!selectedSem) return
    setLoading(true)
    setError('')

    const res = await fetch(`/api/export/excel?semesterId=${selectedSem}`)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Export failed.')
      setLoading(false)
      return
    }

    const blob = await res.blob()
    const sem = semesters.find(s => s.id === selectedSem)
    const filename = `grades-${sem?.name.replace(/\s+/g, '-').toLowerCase() ?? 'export'}.xlsx`

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setLoading(false)
  }

  return (
    <AdminLayout title="Export Grades">
      <div className="max-w-lg">
        <div className="card mb-6">
          <h2 className="font-semibold text-white mb-1">Export to Excel</h2>
          <p className="text-slate-400 text-sm mb-4">
            Generates a formatted .xlsx file with a summary sheet, class-year breakdown, individual member sheets, and a non-submitters list.
          </p>

          <div className="mb-4">
            <label className="label">Select Semester</label>
            <select className="input" value={selectedSem} onChange={e => setSelectedSem(e.target.value)}>
              {semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {error && <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg mb-4">{error}</p>}

          <button onClick={handleExport} disabled={loading || !selectedSem} className="btn-primary w-full py-3">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                Generating Excel…
              </span>
            ) : '📥 Download Excel Report'}
          </button>
        </div>

        <div className="card">
          <h3 className="font-semibold text-white mb-3">What&apos;s included</h3>
          <ul className="space-y-2 text-sm text-slate-300">
            {[
              ['📊', 'Summary Sheet', 'All members, GPA color-coded (green/yellow/red), chapter avg & avg by year'],
              ['📋', 'By Class Year', 'Grouped tables for Freshman through Senior with individual averages'],
              ['👤', 'Member Sheets', 'One sheet per member with their submission history and running GPA average'],
              ['❌', 'Non-Submitters', 'List of members who have not yet submitted for the selected semester'],
            ].map(([icon, name, desc]) => (
              <li key={name as string} className="flex gap-3">
                <span className="shrink-0">{icon}</span>
                <div>
                  <span className="font-medium text-white">{name}</span>
                  <span className="text-slate-400"> — {desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect, supabase } = await requireAdmin(ctx)
  if (redirect) return { redirect }
  const { data: semesters } = await supabase.from('semesters').select('id,name,deadline').order('created_at', { ascending: false })
  return { props: { semesters: semesters ?? [] } }
}
