import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import { useState } from 'react'
import type { Semester } from '@/lib/database.types'

export default function SemestersPage({ semesters: initial }: { semesters: Semester[] }) {
  const [semesters, setSemesters] = useState(initial)
  const [form, setForm] = useState({ name: '', deadline: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editDeadline, setEditDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [emailStatus, setEmailStatus] = useState<Record<string, string>>({})
  const [archiveStatus, setArchiveStatus] = useState<Record<string, string>>({})
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setCreating(true)
    const res = await fetch('/api/semesters/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setCreating(false); return }
    setSemesters(prev => [data.semester, ...prev])
    setForm({ name: '', deadline: '' })
    setCreating(false)
  }

  const updateDeadline = async (id: string) => {
    setSaving(true)
    const res = await fetch('/api/semesters/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId: id, deadline: editDeadline }),
    })
    if (res.ok) {
      setSemesters(prev => prev.map(s => s.id === id ? { ...s, deadline: editDeadline } : s))
      setEditId(null)
    }
    setSaving(false)
  }

  const toggleActive = async (s: Semester) => {
    const res = await fetch('/api/semesters/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId: s.id, isActive: !s.is_active }),
    })
    if (res.ok) {
      setSemesters(prev => prev.map(p => p.id === s.id ? { ...p, is_active: !s.is_active } : p))
    }
  }

  const archiveSemester = async (semesterId: string) => {
    setArchiveStatus(prev => ({ ...prev, [semesterId]: 'Archiving…' }))
    setArchiveConfirm(null)
    const res = await fetch('/api/semesters/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId }),
    })
    const data = await res.json()
    if (res.ok) {
      setSemesters(prev => prev.map(s => s.id === semesterId ? { ...s, is_active: false } : s))
      setArchiveStatus(prev => ({ ...prev, [semesterId]: `✓ Archived — ${data.photosDeleted} photos deleted` }))
    } else {
      setArchiveStatus(prev => ({ ...prev, [semesterId]: `Error: ${data.error}` }))
    }
  }

  const sendReminders = async (semesterId: string, type: 'reminder' | 'deadline_warning') => {
    setEmailStatus(prev => ({ ...prev, [semesterId + type]: 'Sending…' }))
    const res = await fetch('/api/email/send-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId, type }),
    })
    const data = await res.json()
    setEmailStatus(prev => ({
      ...prev,
      [semesterId + type]: res.ok ? `✓ Sent ${data.sent}, skipped ${data.skipped}` : `Error: ${data.error}`,
    }))
  }

  // Format datetime-local value from ISO string
  const toDatetimeLocal = (iso: string) => new Date(iso).toISOString().slice(0, 16)

  return (
    <AdminLayout title="Semesters & Deadlines">
      {/* Create form */}
      <div className="card mb-6">
        <h2 className="font-semibold text-white mb-4">Create New Semester</h2>
        <form onSubmit={create} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="label">Semester Name</label>
            <input className="input" placeholder="e.g. Fall 2025" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="flex-1 min-w-48">
            <label className="label">Submission Deadline</label>
            <input className="input" type="datetime-local" value={form.deadline}
              onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} required />
          </div>
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? 'Creating…' : '+ Create'}
          </button>
        </form>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      {/* Semester list */}
      <div className="space-y-3">
        {semesters.map(s => {
          const isPast = new Date(s.deadline) < new Date()
          return (
            <div key={s.id} className={`card ${s.is_active ? 'border-amber-500/40' : 'opacity-70'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-white">{s.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {isPast && <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300">Deadline Passed</span>}
                  </div>

                  {editId === s.id ? (
                    <div className="flex items-center gap-2 mt-2">
                      <input className="input !w-auto" type="datetime-local" value={editDeadline}
                        onChange={e => setEditDeadline(e.target.value)} />
                      <button onClick={() => updateDeadline(s.id)} disabled={saving} className="btn-primary text-xs py-1.5">
                        {saving ? '…' : 'Save'}
                      </button>
                      <button onClick={() => setEditId(null)} className="btn-secondary text-xs py-1.5">Cancel</button>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">
                      Deadline: {new Date(s.deadline).toLocaleString()}
                      <button onClick={() => { setEditId(s.id); setEditDeadline(toDatetimeLocal(s.deadline)) }}
                        className="ml-2 text-amber-400 hover:text-amber-300 text-xs">Edit</button>
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 items-end shrink-0">
                  <button onClick={() => toggleActive(s)} className="btn-secondary text-xs py-1 px-3">
                    {s.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  {!s.is_active && (
                    archiveConfirm === s.id ? (
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-red-400">Delete all photos?</span>
                        <button onClick={() => archiveSemester(s.id)} className="btn-danger text-xs py-1 px-2">Yes, archive</button>
                        <button onClick={() => setArchiveConfirm(null)} className="btn-secondary text-xs py-1 px-2">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setArchiveConfirm(s.id)} className="text-xs text-slate-400 hover:text-red-400 transition-colors">
                        🗑 Archive photos
                      </button>
                    )
                  )}
                  {archiveStatus[s.id] && (
                    <span className="text-xs text-green-400">{archiveStatus[s.id]}</span>
                  )}
                </div>
              </div>

              {/* Email reminder buttons */}
              {s.is_active && (
                <div className="mt-4 pt-4 border-t border-slate-700 flex flex-wrap gap-3 items-center">
                  <p className="text-slate-400 text-sm">Send email reminders to non-submitters:</p>
                  <button onClick={() => sendReminders(s.id, 'reminder')} className="btn-secondary text-xs py-1.5 px-3">
                    📧 Send Reminder
                  </button>
                  <button onClick={() => sendReminders(s.id, 'deadline_warning')} className="btn-secondary text-xs py-1.5 px-3">
                    ⚠️ Send Deadline Warning
                  </button>
                  {emailStatus[s.id + 'reminder'] && (
                    <span className="text-green-400 text-xs">{emailStatus[s.id + 'reminder']}</span>
                  )}
                  {emailStatus[s.id + 'deadline_warning'] && (
                    <span className="text-amber-400 text-xs">{emailStatus[s.id + 'deadline_warning']}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {semesters.length === 0 && (
          <div className="card text-center py-10">
            <p className="text-slate-400">No semesters yet. Create one above.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect, supabase } = await requireAdmin(ctx)
  if (redirect) return { redirect }
  const { data: semesters } = await supabase.from('semesters').select('*').order('created_at', { ascending: false })
  return { props: { semesters: semesters ?? [] } }
}
