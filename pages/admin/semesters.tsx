import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import { useState } from 'react'
import type { Semester, SemesterRound } from '@/lib/database.types'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

const ALL_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior']

export default function SemestersPage({ semesters: initial, rounds: initialRounds }: { semesters: Semester[]; rounds: SemesterRound[] }) {
  const [semesters, setSemesters] = useState(initial)
  const [rounds, setRounds] = useState(initialRounds)
  const [formName, setFormName] = useState('')
  const [formDeadline, setFormDeadline] = useState<Date | null>(null)
  const [formYears, setFormYears] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editDeadline, setEditDeadline] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const [emailStatus, setEmailStatus] = useState<Record<string, string>>({})
  const [archiveStatus, setArchiveStatus] = useState<Record<string, string>>({})
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null)
  const [reminderYears, setReminderYears] = useState<Record<string, string[]>>({})
  const [showHistory, setShowHistory] = useState(false)
  // Round management state
  const [creatingRoundFor, setCreatingRoundFor] = useState<string | null>(null)
  const [newRoundName, setNewRoundName] = useState('')
  const [newRoundDeadline, setNewRoundDeadline] = useState<Date | null>(null)
  const [savingRound, setSavingRound] = useState(false)
  const [deletingRound, setDeletingRound] = useState<string | null>(null)
  const [deleteRoundConfirm, setDeleteRoundConfirm] = useState<string | null>(null)
  const [deleteSemConfirm, setDeleteSemConfirm] = useState<string | null>(null)
  const [deletingSem, setDeletingSem] = useState<string | null>(null)

  const active = semesters.filter(s => s.is_active)
  const history = semesters.filter(s => !s.is_active)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formDeadline) return setError('Please select a deadline.')
    setError('')
    setCreating(true)
    const res = await fetch('/api/semesters/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formName, deadline: formDeadline.toISOString(), required_years: formYears }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setCreating(false); return }
    setSemesters(prev => [data.semester, ...prev])
    setFormName('')
    setFormDeadline(null)
    setFormYears([])
    setCreating(false)
  }

  const updateDeadline = async (id: string) => {
    if (!editDeadline) return
    setSaving(true)
    const res = await fetch('/api/semesters/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId: id, deadline: editDeadline.toISOString() }),
    })
    if (res.ok) {
      setSemesters(prev => prev.map(s => s.id === id ? { ...s, deadline: editDeadline.toISOString() } : s))
      setEditId(null)
    }
    setSaving(false)
  }

  const toggleActive = async (s: Semester) => {
    if (s.is_active && !window.confirm(`Deactivate "${s.name}"?\n\nMembers will immediately lose the ability to submit grades. You can reactivate at any time.`)) return
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

  const toggleYear = (semesterId: string, year: string) => {
    setReminderYears(prev => {
      const current = prev[semesterId] ?? ALL_YEARS
      const next = current.includes(year) ? current.filter(y => y !== year) : [...current, year]
      return { ...prev, [semesterId]: next }
    })
  }

  const sendReminders = async (semesterId: string, type: 'reminder' | 'deadline_warning') => {
    const years = reminderYears[semesterId] ?? ALL_YEARS
    setEmailStatus(prev => ({ ...prev, [semesterId + type]: 'Sending…' }))
    const res = await fetch('/api/email/send-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId, type, classYears: years }),
    })
    const data = await res.json()
    const errorNote = data.errors?.length ? ` · ${data.errors.length} failed` : ''
    setEmailStatus(prev => ({
      ...prev,
      [semesterId + type]: res.ok ? `✓ Sent ${data.sent}, skipped ${data.skipped}${errorNote}` : `Error: ${data.error}`,
    }))
  }

  const createRound = async (semesterId: string) => {
    if (!newRoundDeadline) return
    setSavingRound(true)
    const res = await fetch('/api/rounds/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId, name: newRoundName || `Round ${(rounds.filter(r => r.semester_id === semesterId).length) + 1}`, deadline: newRoundDeadline.toISOString() }),
    })
    const data = await res.json()
    if (res.ok) {
      setRounds(prev => [...prev, data.round])
      setCreatingRoundFor(null)
      setNewRoundName('')
      setNewRoundDeadline(null)
    }
    setSavingRound(false)
  }

  const deleteRound = async (roundId: string) => {
    setDeletingRound(roundId)
    setDeleteRoundConfirm(null)
    const res = await fetch('/api/rounds/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId }),
    })
    if (res.ok) {
      setRounds(prev => prev.filter(r => r.id !== roundId))
    }
    setDeletingRound(null)
  }

  const deleteSemester = async (semesterId: string) => {
    setDeletingSem(semesterId)
    setDeleteSemConfirm(null)
    const res = await fetch('/api/semesters/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId }),
    })
    if (res.ok) {
      setSemesters(prev => prev.filter(s => s.id !== semesterId))
    }
    setDeletingSem(null)
  }

  const toggleRound = async (r: SemesterRound) => {
    const res = await fetch('/api/rounds/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: r.id, isActive: !r.is_active }),
    })
    if (res.ok) setRounds(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !r.is_active } : x))
  }

  const SemesterCard = ({ s }: { s: Semester }) => {
    const semRounds = rounds.filter(r => r.semester_id === s.id).sort((a, b) => a.round_number - b.round_number)
    const isPast = new Date(s.deadline) < new Date()
    const years = reminderYears[s.id] ?? ALL_YEARS

    return (
      <div className={`card ${s.is_active ? 'border-amber-500/40' : 'border-slate-700'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold text-white">{s.name}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                {s.is_active ? 'Active' : 'Inactive'}
              </span>
              {isPast && <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300">Deadline Passed</span>}
            </div>

            <p className="text-slate-500 text-xs mt-0.5 mb-1">
              Required: {(s.required_years ?? ALL_YEARS).join(', ')}
            </p>

            {editId === s.id ? (
              <div className="flex items-center gap-2 mt-2">
                <DatePicker
                  selected={editDeadline}
                  onChange={(date: Date | null) => setEditDeadline(date)}
                  showTimeSelect
                  timeIntervals={15}
                  injectTimes={[new Date(new Date().setHours(23, 59, 0, 0))]}
                  dateFormat="MM/dd/yyyy h:mm aa"
                  placeholderText="Pick new deadline"
                  className="input"
                  withPortal
                />
                <button onClick={() => updateDeadline(s.id)} disabled={saving || !editDeadline} className="btn-primary text-xs py-1.5">
                  {saving ? '…' : 'Save'}
                </button>
                <button onClick={() => setEditId(null)} className="btn-secondary text-xs py-1.5">Cancel</button>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">
                Deadline: {new Date(s.deadline).toLocaleString()}
                {s.is_active && (
                  <button onClick={() => { setEditId(s.id); setEditDeadline(new Date(s.deadline)) }}
                    className="ml-2 text-amber-400 hover:text-amber-300 text-xs">Edit</button>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 items-end shrink-0">
            <button onClick={() => toggleActive(s)} className="btn-secondary text-xs py-1 px-3">
              {s.is_active ? 'Deactivate' : 'Activate'}
            </button>
            {deleteSemConfirm === s.id ? (
              <div className="flex flex-col gap-1.5 items-end">
                <span className="text-xs text-red-400 text-right max-w-48">Permanently delete "{s.name}" and all its submissions? This cannot be undone.</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => deleteSemester(s.id)}
                    disabled={deletingSem === s.id}
                    className="btn-danger text-xs py-1 px-2"
                  >
                    {deletingSem === s.id ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button onClick={() => setDeleteSemConfirm(null)} className="btn-secondary text-xs py-1 px-2">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setDeleteSemConfirm(s.id)}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                🗑 Delete semester
              </button>
            )}
            {!s.is_active && (
              archiveConfirm === s.id ? (
                <div className="flex flex-col gap-1.5 items-end">
                  <span className="text-xs text-red-400 text-right">Permanently delete all photos? Grade records are kept but files cannot be recovered.</span>
                  <div className="flex gap-2">
                    <button onClick={() => archiveSemester(s.id)} className="btn-danger text-xs py-1 px-2">Yes, delete permanently</button>
                    <button onClick={() => setArchiveConfirm(null)} className="btn-secondary text-xs py-1 px-2">Cancel</button>
                  </div>
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

        {/* Email reminder section */}
        {s.is_active && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            {/* Class year filter */}
            <div className="flex flex-wrap gap-2 items-center mb-3">
              <span className="text-slate-400 text-xs">Target:</span>
              {ALL_YEARS.map(yr => (
                <button
                  key={yr}
                  onClick={() => toggleYear(s.id, yr)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    years.includes(yr)
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'
                  }`}
                >
                  {yr}
                </button>
              ))}
              {years.length !== ALL_YEARS.length && (
                <button onClick={() => setReminderYears(prev => ({ ...prev, [s.id]: ALL_YEARS }))}
                  className="text-xs text-slate-500 hover:text-slate-300">All</button>
              )}
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <p className="text-slate-400 text-sm">Send reminders to non-submitters:</p>
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
          </div>
        )}

        {/* Rounds section */}
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-300 text-sm font-medium">Submission Rounds</p>
            {s.is_active && (
              <button
                onClick={() => { setCreatingRoundFor(s.id); setNewRoundName(''); setNewRoundDeadline(null) }}
                className="text-amber-400 hover:text-amber-300 text-xs"
              >
                + New Round
              </button>
            )}
          </div>

          {semRounds.length === 0 ? (
            <p className="text-slate-500 text-xs">Round 1 will be created automatically when you create a semester. Create additional rounds here to open a fresh submission window.</p>
          ) : (
            <div className="space-y-2 mb-2">
              {semRounds.map(r => (
                <div key={r.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm">{r.name}</p>
                    <p className="text-slate-400 text-xs">
                      Due {new Date(r.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    {deleteRoundConfirm === r.id && (
                      <div className="mt-1.5">
                        <p className="text-red-400 text-xs mb-1.5">Delete this round and all its submissions? This cannot be undone.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => deleteRound(r.id)}
                            disabled={deletingRound === r.id}
                            className="btn-danger text-xs py-0.5 px-2"
                          >
                            {deletingRound === r.id ? 'Deleting…' : 'Yes, delete'}
                          </button>
                          <button onClick={() => setDeleteRoundConfirm(null)} className="btn-secondary text-xs py-0.5 px-2">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.is_active ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                      {r.is_active ? 'Open' : 'Closed'}
                    </span>
                    <button onClick={() => toggleRound(r)} className="btn-secondary text-xs py-0.5 px-2">
                      {r.is_active ? 'Close' : 'Reopen'}
                    </button>
                    <button
                      onClick={() => setDeleteRoundConfirm(prev => prev === r.id ? null : r.id)}
                      className="text-xs text-slate-500 hover:text-red-400 transition-colors px-1"
                      title="Delete round"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {creatingRoundFor === s.id && (
            <div className="mt-3 flex flex-wrap gap-2 items-end border-t border-slate-700/50 pt-3">
              <div className="flex-1 min-w-32">
                <label className="label text-xs">Round Name</label>
                <input
                  className="input !py-1.5 !text-sm"
                  placeholder={`Round ${semRounds.length + 1}`}
                  value={newRoundName}
                  onChange={e => setNewRoundName(e.target.value)}
                />
              </div>
              <div className="flex-1 min-w-40">
                <label className="label text-xs">Deadline</label>
                <DatePicker
                  selected={newRoundDeadline}
                  onChange={(date: Date | null) => setNewRoundDeadline(date)}
                  showTimeSelect
                  timeIntervals={15}
                  dateFormat="MM/dd/yyyy h:mm aa"
                  placeholderText="Pick deadline"
                  className="input !py-1.5 !text-sm w-full"
                  minDate={new Date()}
                  withPortal
                />
              </div>
              <button
                onClick={() => createRound(s.id)}
                disabled={savingRound || !newRoundDeadline}
                className="btn-primary text-xs py-1.5"
              >
                {savingRound ? '…' : 'Create'}
              </button>
              <button onClick={() => setCreatingRoundFor(null)} className="btn-secondary text-xs py-1.5">Cancel</button>
            </div>
          )}
        </div>

      </div>
    )
  }

  return (
    <AdminLayout title="Semesters & Deadlines">
      <style>{`
        .react-datepicker-wrapper { width: 100%; }
        .react-datepicker__input-container input { width: 100%; }
        .react-datepicker { font-family: inherit; background: #1e293b; border: 1px solid #334155; color: #e2e8f0; }
        .react-datepicker__header { background: #0f172a; border-bottom: 1px solid #334155; }
        .react-datepicker__current-month, .react-datepicker__day-name, .react-datepicker-time__header { color: #e2e8f0; }
        .react-datepicker__day { color: #cbd5e1; }
        .react-datepicker__day:hover { background: #334155; color: white; border-radius: 4px; }
        .react-datepicker__day--selected, .react-datepicker__day--keyboard-selected { background: #f59e0b; color: #0f172a; border-radius: 4px; }
        .react-datepicker__time-container { border-left: 1px solid #334155; }
        .react-datepicker__time { background: #1e293b; }
        .react-datepicker__time-list-item { color: #cbd5e1; }
        .react-datepicker__time-list-item:hover { background: #334155 !important; }
        .react-datepicker__time-list-item--selected { background: #f59e0b !important; color: #0f172a !important; }
        .react-datepicker__navigation-icon::before { border-color: #94a3b8; }
        .react-datepicker__day--outside-month { color: #475569; }
        .react-datepicker__portal { align-items: flex-start !important; padding-top: 40px; overflow-y: auto; }
      `}</style>

      {/* Create form */}
      <div className="card mb-6">
        <h2 className="font-semibold text-white mb-4">Create New Semester</h2>
        <form onSubmit={create} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="label">Semester Name</label>
            <input className="input" placeholder="e.g. Fall 2025" value={formName}
              onChange={e => setFormName(e.target.value)} required />
          </div>
          <div className="flex-1 min-w-48">
            <label className="label">Submission Deadline</label>
            <DatePicker
              selected={formDeadline}
              onChange={(date: Date | null) => setFormDeadline(date)}
              showTimeSelect
              timeIntervals={15}
              injectTimes={[new Date(new Date().setHours(23, 59, 0, 0))]}
              dateFormat="MM/dd/yyyy h:mm aa"
              placeholderText="Click to pick date & time"
              className="input w-full"
              minDate={new Date()}
              withPortal
            />
          </div>
          <div className="w-full">
            <label className="label">Required Years</label>
            <div className="flex gap-2 flex-wrap">
              {ALL_YEARS.map(yr => (
                <button type="button" key={yr}
                  onClick={() => setFormYears(prev => prev.includes(yr) ? prev.filter(y => y !== yr) : [...prev, yr])}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    formYears.includes(yr)
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="btn-primary self-end" disabled={creating || formYears.length === 0}>
            {creating ? 'Creating…' : '+ Create'}
          </button>
        </form>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      {/* Active semesters */}
      <h2 className="font-semibold text-white mb-3">Active Semesters</h2>
      <div className="space-y-3 mb-8">
        {active.map(s => <SemesterCard key={s.id} s={s} />)}
        {active.length === 0 && (
          <div className="card text-center py-8">
            <p className="text-slate-400">No active semesters. Create one above.</p>
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium mb-3 transition-colors"
          >
            <span className={`transition-transform ${showHistory ? 'rotate-90' : ''}`}>▶</span>
            History ({history.length} semester{history.length !== 1 ? 's' : ''})
          </button>
          {showHistory && (
            <div className="space-y-3 opacity-80">
              {history.map(s => <SemesterCard key={s.id} s={s} />)}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect, supabase } = await requireAdmin(ctx)
  if (redirect) return { redirect }
  const { data: semesters } = await supabase.from('semesters').select('*').order('created_at', { ascending: false })
  const semesterIds = (semesters ?? []).map((s: any) => s.id)
  const { data: rounds } = semesterIds.length
    ? await supabase.from('semester_rounds').select('*').in('semester_id', semesterIds).order('round_number', { ascending: true })
    : { data: [] }
  return { props: { semesters: semesters ?? [], rounds: rounds ?? [] } }
}
