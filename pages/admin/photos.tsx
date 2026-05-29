import { GetServerSideProps } from 'next'
import { requireAdmin } from '@/lib/auth'
import AdminLayout from '@/components/layout/AdminLayout'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import { gpaColorClass } from '@/lib/gpa'

interface PhotoEntry {
  id: string
  member_id: string
  member_name: string
  photo_url: string
  semester_id: string
  semester_name: string
  round_name: string | null
  submitted_at: string
  status: string
  final_gpa: number | null
  ocr_gpa: number | null
  duplicate_flag: boolean
  admin_notes: string | null
}

interface Props {
  photos: PhotoEntry[]
  semesters: { id: string; name: string }[]
}

function StatusPill({ status }: { status: string }) {
  if (status === 'reviewed') return <span className="badge-reviewed !text-[10px] !px-1.5 !py-0.5">Reviewed</span>
  if (status === 'declined') return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/60 text-red-400 font-medium">Declined</span>
  if (status === 'no_grade') return <span className="badge-no-grade !text-[10px] !px-1.5 !py-0.5">No Grade</span>
  return <span className="badge-pending !text-[10px] !px-1.5 !py-0.5">Pending</span>
}

export default function PhotoArchivePage({ photos: initialPhotos, semesters }: Props) {
  const [photos, setPhotos] = useState(initialPhotos)
  const [selected, setSelected] = useState<PhotoEntry | null>(null)
  const [semFilter, setSemFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => photos
    .filter(p => semFilter === 'all' || p.semester_id === semFilter)
    .filter(p => statusFilter === 'all' || p.status === statusFilter)
    .filter(p => !search || p.member_name.toLowerCase().includes(search.toLowerCase()))
  , [photos, semFilter, statusFilter, search])

  const approve = async (p: PhotoEntry) => {
    setSaving(true)
    const res = await fetch('/api/submissions/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: p.id, status: 'reviewed' }),
    })
    const data = await res.json()
    if (res.ok) {
      const updated = { ...p, status: 'reviewed', final_gpa: data.finalGpa ?? p.final_gpa }
      setPhotos(prev => prev.map(x => x.id === p.id ? updated : x))
      setSelected(prev => prev?.id === p.id ? updated : prev)
    }
    setSaving(false)
  }

  const decline = async (p: PhotoEntry) => {
    setSaving(true)
    const res = await fetch('/api/submissions/decline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: p.id, declineReason: declineReason || undefined }),
    })
    if (res.ok) {
      const updated = { ...p, status: 'declined' }
      setPhotos(prev => prev.map(x => x.id === p.id ? updated : x))
      setSelected(prev => prev?.id === p.id ? updated : prev)
      setDeclining(false)
      setDeclineReason('')
    }
    setSaving(false)
  }

  const select = (p: PhotoEntry) => { setSelected(p); setDeclining(false); setDeclineReason('') }
  const deselect = () => { setSelected(null); setDeclining(false); setDeclineReason('') }

  return (
    <AdminLayout title="Photo Archive">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          className="input !py-1.5 !text-sm w-44"
          placeholder="Search member…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input !py-1.5 !text-sm w-48" value={semFilter} onChange={e => setSemFilter(e.target.value)}>
          <option value="all">All Semesters</option>
          {semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input !py-1.5 !text-sm w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="declined">Declined</option>
          <option value="no_grade">No Grade</option>
        </select>
        <span className="text-slate-500 text-sm self-center ml-auto">
          {filtered.length} photo{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">No photos match your filters.</div>
      ) : (
        <div className="flex gap-5 items-start">
          {/* Grid */}
          <div className={selected ? 'w-64 shrink-0' : 'w-full'}>
            <div className={`grid gap-3 ${selected ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
              {filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => p.id === selected?.id ? deselect() : select(p)}
                  className={`card !p-0 overflow-hidden text-left transition-all ${
                    p.id === selected?.id
                      ? 'ring-2 ring-amber-500'
                      : 'hover:ring-2 hover:ring-amber-500/40'
                  }`}
                >
                  <div className="relative bg-slate-800" style={{ aspectRatio: '4/3' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photo_url} alt={p.member_name} className="w-full h-full object-cover" />
                    {p.duplicate_flag && (
                      <span className="absolute top-1 right-1 bg-amber-500/90 text-slate-900 text-[9px] font-bold px-1 py-0.5 rounded">⚠</span>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/80 to-transparent px-1.5 py-1.5">
                      <StatusPill status={p.status} />
                    </div>
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-white text-[11px] font-semibold truncate">{p.member_name}</p>
                    <p className="text-slate-500 text-[10px] truncate">{p.semester_name}{p.round_name ? ` · ${p.round_name}` : ''}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="flex-1 sticky top-4 self-start card !p-0 overflow-hidden">
              {/* Panel header */}
              <div className="flex items-start justify-between px-4 py-3 border-b border-slate-700">
                <div>
                  <p className="text-white font-semibold">{selected.member_name}</p>
                  <p className="text-slate-400 text-sm">
                    {selected.semester_name}{selected.round_name ? ` · ${selected.round_name}` : ''}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">{new Date(selected.submitted_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill status={selected.status} />
                  <button onClick={deselect} className="text-slate-500 hover:text-white text-xl leading-none ml-1">×</button>
                </div>
              </div>

              {/* Full photo */}
              <div className="bg-slate-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.photo_url}
                  alt="Grade screenshot"
                  className="w-full object-contain max-h-[60vh]"
                />
              </div>

              {/* Meta + actions */}
              <div className="px-4 py-3 space-y-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  {selected.ocr_gpa != null && (
                    <span className="text-slate-400">
                      OCR: <span className={`font-semibold ${gpaColorClass(selected.ocr_gpa)}`}>{selected.ocr_gpa.toFixed(2)}</span>
                    </span>
                  )}
                  {selected.final_gpa != null && (
                    <span className="text-slate-400">
                      Final: <span className={`font-semibold ${gpaColorClass(selected.final_gpa)}`}>{selected.final_gpa.toFixed(2)}</span>
                    </span>
                  )}
                  {selected.duplicate_flag && (
                    <span className="text-amber-400 text-xs font-medium">⚠ Flagged as possible duplicate</span>
                  )}
                </div>

                {selected.admin_notes && (
                  <p className="text-slate-400 text-xs italic bg-slate-900/40 px-3 py-2 rounded-lg">{selected.admin_notes}</p>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <Link href={`/admin/members/${selected.member_id}`} className="text-xs text-slate-400 hover:text-white underline">
                    View member →
                  </Link>
                  {selected.status !== 'reviewed' && !declining && (
                    <button onClick={() => approve(selected)} disabled={saving} className="btn-primary text-xs py-1.5 px-4 ml-auto">
                      {saving ? '…' : '✓ Approve'}
                    </button>
                  )}
                  {!declining && (
                    <button
                      onClick={() => setDeclining(true)}
                      disabled={saving}
                      className={`text-xs bg-red-900/40 hover:bg-red-900/60 text-red-400 px-3 py-1.5 rounded border border-red-800/40 transition-colors ${selected.status === 'reviewed' ? 'ml-auto' : ''}`}
                    >
                      ✗ Decline
                    </button>
                  )}
                </div>

                {declining && (
                  <div className="space-y-2">
                    <input
                      className="input !py-1.5 !text-sm w-full"
                      placeholder="Decline reason (optional, sent to member)"
                      value={declineReason}
                      onChange={e => setDeclineReason(e.target.value)}
                      maxLength={500}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => decline(selected)} disabled={saving}
                        className="text-xs bg-red-900/40 hover:bg-red-900/60 text-red-400 px-3 py-1.5 rounded border border-red-800/40">
                        {saving ? '…' : 'Confirm Decline'}
                      </button>
                      <button onClick={() => { setDeclining(false); setDeclineReason('') }}
                        className="text-xs text-slate-500 hover:text-slate-300">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect } = await requireAdmin(ctx)
  if (redirect) return { redirect }

  const { supabaseAdmin } = await import('@/lib/supabaseAdmin')

  const [{ data: subsRaw }, { data: semsRaw }] = await Promise.all([
    supabaseAdmin
      .from('submissions')
      .select('id, member_id, photo_url, semester_id, round_id, submitted_at, status, final_gpa, ocr_gpa, duplicate_flag, admin_notes, profiles(full_name), semesters(name), semester_rounds(name)')
      .not('photo_url', 'is', null)
      .order('submitted_at', { ascending: false }),
    supabaseAdmin.from('semesters').select('id, name').order('created_at', { ascending: false }),
  ])

  // photo_url stores the raw storage path — generate signed URLs so the browser can load them
  const paths = (subsRaw ?? []).map((s: any) => s.photo_url as string)
  const { data: signedData } = paths.length > 0
    ? await supabaseAdmin.storage.from('grade-photos').createSignedUrls(paths, 7200)
    : { data: [] }

  const signedMap = new Map((signedData ?? []).map((s: any) => [s.path, s.signedUrl]))

  const photos: PhotoEntry[] = (subsRaw ?? []).map((s: any) => ({
    id: s.id,
    member_id: s.member_id,
    member_name: s.profiles?.full_name ?? '—',
    photo_url: signedMap.get(s.photo_url) ?? s.photo_url,
    semester_id: s.semester_id,
    semester_name: s.semesters?.name ?? '—',
    round_name: s.semester_rounds?.name ?? null,
    submitted_at: s.submitted_at,
    status: s.status,
    final_gpa: s.final_gpa ?? null,
    ocr_gpa: s.ocr_gpa ?? null,
    duplicate_flag: s.duplicate_flag ?? false,
    admin_notes: s.admin_notes ?? null,
  }))

  return { props: { photos, semesters: semsRaw ?? [] } }
}
