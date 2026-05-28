import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'
import type { Semester, SemesterRound, MemberCourse } from '@/lib/database.types'
import Layout from '@/components/layout/Layout'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { GRADE_MAP } from '@/lib/gpa'

interface Props {
  semester: Semester
  alreadySubmitted: boolean
  activeRound: SemesterRound | null
  memberCourses: MemberCourse[]
  declinedReason: string | null
}

type Step = 'course_entry' | 'course_review' | 'choose' | 'ocr' | 'confirm' | 'no_grade' | 'not_posted' | 'done'

interface CourseRow {
  key: string
  course_id: string
  course_name: string
  credits: string
}

interface OcrState {
  rawText: string
  detectedGrade: string | null
  gpa: number | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  allGrades: string[]
  courseGrades: Record<string, string>
  directGpa: number | null
}

export default function SubmitPage({ semester, alreadySubmitted, activeRound, memberCourses: initialCourses, declinedReason }: Props) {
  const router = useRouter()
  const submitLockRef = useRef(false)

  const getInitialStep = (): Step => {
    if (!activeRound) return 'choose'
    if (initialCourses.filter(c => c.status === 'active').length === 0) return 'course_entry'
    return 'course_review'
  }

  const [step, setStep] = useState<Step>(getInitialStep)

  // Course entry state
  const [courseRows, setCourseRows] = useState<CourseRow[]>([
    { key: '1', course_id: '', course_name: '', credits: '' },
  ])
  const [courseEntryError, setCourseEntryError] = useState('')
  const [savingCourses, setSavingCourses] = useState(false)

  // Course review / drop state
  const [courses, setCourses] = useState(initialCourses)
  const [pendingDrops, setPendingDrops] = useState<string[]>([])
  const [savingDrops, setSavingDrops] = useState(false)
  const [showAddCourse, setShowAddCourse] = useState(false)
  const [newCourseRows, setNewCourseRows] = useState<CourseRow[]>([{ key: '1', course_id: '', course_name: '', credits: '' }])
  const [addCourseError, setAddCourseError] = useState('')
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState({ course_id: '', course_name: '', credits: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Photo/OCR state
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [ocrFailed, setOcrFailed] = useState(false)

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])

  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrState, setOcrState] = useState<OcrState | null>(null)
  const [selectedGrade, setSelectedGrade] = useState<string>('')
  const [lowQualityFlag, setLowQualityFlag] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [perCourseNoGrade, setPerCourseNoGrade] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const activeDeadline = activeRound?.deadline ?? semester.deadline
  const isPastDeadline = new Date(activeDeadline) < new Date()

  // ── Course Entry ──────────────────────────────────────────
  const addCourseRow = () =>
    setCourseRows(prev => [...prev, { key: Date.now().toString(), course_id: '', course_name: '', credits: '' }])

  const updateCourseRow = (key: string, field: keyof CourseRow, value: string) =>
    setCourseRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))

  const removeCourseRow = (key: string) =>
    setCourseRows(prev => prev.length > 1 ? prev.filter(r => r.key !== key) : prev)

  const handleSaveCourses = async () => {
    setCourseEntryError('')
    const filled = courseRows.filter(r => r.course_id.trim() || r.course_name.trim() || r.credits.trim())
    if (filled.length === 0) { setCourseEntryError('Add at least one course.'); return }
    for (const r of filled) {
      if (!r.course_id.trim()) { setCourseEntryError('Course ID is required for all rows.'); return }
      if (!r.course_name.trim()) { setCourseEntryError('Course name is required for all rows.'); return }
      const cr = parseInt(r.credits)
      if (isNaN(cr) || cr < 1 || cr > 6) { setCourseEntryError('Credits must be a number 1–6 for all rows.'); return }
    }
    setSavingCourses(true)
    const res = await fetch('/api/courses/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        semesterId: semester.id,
        courses: filled.map(r => ({
          course_id: r.course_id.toUpperCase().trim(),
          course_name: r.course_name.trim(),
          credits: parseInt(r.credits),
        })),
      }),
    })
    const data = await res.json()
    if (!res.ok) { setCourseEntryError(data.error); setSavingCourses(false); return }
    setSavingCourses(false)
    setStep('choose')
  }

  // ── Course Review / Drops ─────────────────────────────────
  const toggleDrop = (courseId: string, courseName: string) => {
    if (pendingDrops.includes(courseId)) {
      setPendingDrops(prev => prev.filter(id => id !== courseId))
      return
    }
    if (!window.confirm(
      `Mark ${courseId} — ${courseName} as dropped?\n\nThe VP of Academics & Scholarship will be notified. This cannot be undone.`
    )) return
    setPendingDrops(prev => [...prev, courseId])
  }

  const startEdit = (c: typeof courses[0]) => {
    setEditingId(c.id)
    setEditValues({ course_id: c.course_id, course_name: c.course_name, credits: String(c.credits) })
    setEditError('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    setEditError('')
    const cr = parseInt(editValues.credits)
    if (!editValues.course_id.trim()) { setEditError('Course ID required.'); return }
    if (!editValues.course_name.trim()) { setEditError('Course name required.'); return }
    if (isNaN(cr) || cr < 1 || cr > 6) { setEditError('Credits must be 1–6.'); return }
    setEditSaving(true)
    const res = await fetch('/api/courses/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberCourseId: editingId, course_id: editValues.course_id, course_name: editValues.course_name, credits: cr }),
    })
    const data = await res.json()
    if (!res.ok) { setEditError(data.error ?? 'Failed to save.'); setEditSaving(false); return }
    setCourses(prev => prev.map(c => c.id === editingId
      ? { ...c, course_id: editValues.course_id.toUpperCase().trim(), course_name: editValues.course_name.trim(), credits: cr }
      : c
    ))
    setEditingId(null)
    setEditSaving(false)
  }

  const handleContinueFromReview = async () => {
    // Validate any new courses before proceeding
    const filledNew = newCourseRows.filter(r => r.course_id.trim() || r.course_name.trim() || r.credits.trim())
    if (showAddCourse && filledNew.length > 0) {
      setAddCourseError('')
      for (const r of filledNew) {
        if (!r.course_id.trim()) { setAddCourseError('Course ID is required for all new courses.'); return }
        if (!r.course_name.trim()) { setAddCourseError('Course name is required for all new courses.'); return }
        const cr = parseInt(r.credits)
        if (isNaN(cr) || cr < 1 || cr > 6) { setAddCourseError('Credits must be a number 1–6.'); return }
      }
    }

    setSavingDrops(true)
    if (pendingDrops.length > 0) {
      for (const courseId of pendingDrops) {
        await fetch('/api/courses/drop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ semesterId: semester.id, courseId }),
        })
      }
      // Mark dropped courses in local state
      setCourses(prev => prev.map(c => pendingDrops.includes(c.course_id) ? { ...c, status: 'dropped' as const } : c))
      setPendingDrops([])
    }
    if (showAddCourse && filledNew.length > 0) {
      const saveRes = await fetch('/api/courses/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          semesterId: semester.id,
          courses: filledNew.map(r => ({
            course_id: r.course_id.toUpperCase().trim(),
            course_name: r.course_name.trim(),
            credits: parseInt(r.credits),
          })),
        }),
      })
      if (saveRes.ok) {
        // Append new courses to local state so they appear in the no-grade checkboxes
        const now = new Date().toISOString()
        const newEntries = filledNew.map((r, i) => ({
          id: `temp-${Date.now()}-${i}`,
          member_id: '',
          semester_id: semester.id,
          course_id: r.course_id.toUpperCase().trim(),
          course_name: r.course_name.trim(),
          credits: parseInt(r.credits),
          status: 'active' as const,
          dropped_at: null,
          created_at: now,
        }))
        setCourses(prev => [...prev, ...newEntries])
        setShowAddCourse(false)
        setNewCourseRows([{ key: '1', course_id: '', course_name: '', credits: '' }])
      }
    }
    setSavingDrops(false)
    setStep('choose')
  }

  // ── Photo / OCR ───────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) {
      setError('File is too large. Please upload an image under 5MB.')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setStep('ocr')
    setOcrLoading(true)
    setOcrFailed(false)
    try {
      const { runOcr } = await import('@/lib/ocr')
      const result = await runOcr(f)
      setOcrState(result)
      setSelectedGrade(result.detectedGrade ?? '')
      setLowQualityFlag(false)
    } catch {
      setOcrFailed(true)
      setLowQualityFlag(true)
      setOcrState({ rawText: '', detectedGrade: null, gpa: null, confidence: 'none', allGrades: [], courseGrades: {}, directGpa: null })
    } finally {
      setOcrLoading(false)
      setStep('confirm')
    }
  }

  const handleSubmitPhoto = async () => {
    if (!file || submitLockRef.current) return
    submitLockRef.current = true
    setSubmitting(true)
    setError('')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('semesterId', semester.id)
    formData.append('ocrRawText', ocrState?.rawText ?? '')
    formData.append('ocrGrade', lowQualityFlag ? '' : selectedGrade)
    if (ocrState?.directGpa != null) formData.append('directGpa', String(ocrState.directGpa))
    const mergedCourseGrades = { ...(ocrState?.courseGrades ?? {}) }
    Array.from(perCourseNoGrade).forEach(cid => { mergedCourseGrades[cid] = 'N/A' })
    formData.append('courseGrades', JSON.stringify(mergedCourseGrades))
    if (activeRound) formData.append('roundId', activeRound.id)
    const res = await fetch('/api/submissions/create', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Submission failed.')
      submitLockRef.current = false
      setSubmitting(false)
      return
    }
    setSubmittedAt(new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))
    setStep('done')
    submitLockRef.current = false
    setSubmitting(false)
  }

  const handleNoGrade = async () => {
    if (submitLockRef.current) return
    submitLockRef.current = true
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/submissions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId: semester.id, noGrade: true, roundId: activeRound?.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Submission failed.')
      submitLockRef.current = false
      setSubmitting(false)
      return
    }
    setSubmittedAt(new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))
    setStep('done')
    submitLockRef.current = false
    setSubmitting(false)
  }

  const confidenceColors: Record<string, string> = {
    high: 'text-green-400', medium: 'text-yellow-400', low: 'text-orange-400', none: 'text-red-400',
  }
  const confidenceLabel: Record<string, string> = {
    high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence (percentage fallback)', none: 'Grade not detected',
  }

  const pageTitle = activeRound ? `${semester.name} — ${activeRound.name}` : semester.name

  // ── Guard screens ─────────────────────────────────────────
  if (alreadySubmitted) {
    return (
      <Layout title={pageTitle}>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-white font-semibold text-lg">Already submitted</p>
          <p className="text-slate-400 text-sm mt-1">
            You&apos;ve already submitted grades for {pageTitle}.
            {activeRound && ' The VP of Academics & Scholarship will open a new round when it\'s time to check again.'}
          </p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary mt-6">Back to Dashboard</button>
        </div>
      </Layout>
    )
  }

  if (isPastDeadline) {
    return (
      <Layout title={pageTitle}>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <p className="text-4xl mb-3">⏰</p>
          <p className="text-white font-semibold text-lg">Deadline has passed</p>
          <p className="text-slate-400 text-sm mt-1">The submission window for {pageTitle} is closed.</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary mt-6">Back to Dashboard</button>
        </div>
      </Layout>
    )
  }

  if (step === 'done') {
    return (
      <Layout title="Submitted!">
        <div className="card text-center py-12 max-w-lg mx-auto">
          <p className="text-5xl mb-4">🎉</p>
          <h2 className="text-2xl font-bold text-white mb-2">Submission Received</h2>
          <p className="text-slate-400 mb-2">
            Your grades for <strong className="text-white">{pageTitle}</strong> have been submitted.
          </p>
          {submittedAt && (
            <p className="text-slate-500 text-xs mb-2">Submitted {submittedAt}</p>
          )}
          <p className="text-slate-400 text-sm mb-6">The VP of Academics &amp; Scholarship will review them shortly. A confirmation email has been sent to your address.</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary px-8">Back to Dashboard</button>
        </div>
      </Layout>
    )
  }

  // ── Main form ─────────────────────────────────────────────
  return (
    <Layout title={`Submit Grades — ${pageTitle}`}>
      <div className="max-w-2xl mx-auto">

        {/* Declined banner */}
        {declinedReason !== null && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-red-700 bg-red-900/20">
            <p className="text-red-300 font-semibold text-sm">Your previous submission was declined</p>
            {declinedReason && <p className="text-slate-400 text-sm mt-0.5">Reason: {declinedReason}</p>}
            <p className="text-slate-400 text-sm mt-0.5">Please submit a correct screenshot of your grades below.</p>
          </div>
        )}

        {/* Header */}
        <div className="card mb-4 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm">Semester</p>
            <p className="text-white font-semibold">{semester.name}</p>
            {activeRound && <p className="text-amber-400 text-xs mt-0.5">{activeRound.name}</p>}
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-sm">Deadline</p>
            <p className="text-amber-400 font-semibold text-sm">{new Date(activeDeadline).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
          </div>
        </div>

        <input id="grade-photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFileChange} />

        {/* Step: Enter courses (first time) */}
        {step === 'course_entry' && (
          <div className="card">
            <h3 className="font-semibold text-white mb-1">Enter Your Courses</h3>
            <p className="text-slate-400 text-sm mb-4">
              List every class you&apos;re enrolled in this semester. You only need to do this once — future rounds will remember your course list.
            </p>
            <div className="mb-1 hidden sm:grid sm:grid-cols-[1fr_2fr_60px_28px] gap-2">
              <span className="text-slate-500 text-xs">Course ID</span>
              <span className="text-slate-500 text-xs">Course Name</span>
              <span className="text-slate-500 text-xs text-center">Credits</span>
              <span />
            </div>
            <div className="space-y-2 mb-4">
              {courseRows.map(row => (
                <div key={row.key} className="grid grid-cols-[1fr_2fr_60px_28px] gap-2 items-center">
                  <input
                    className="input !py-1.5 !text-sm uppercase placeholder:normal-case"
                    placeholder="ENGR 110"
                    value={row.course_id}
                    onChange={e => updateCourseRow(row.key, 'course_id', e.target.value)}
                  />
                  <input
                    className="input !py-1.5 !text-sm"
                    placeholder="Engineering Fundamentals"
                    value={row.course_name}
                    onChange={e => updateCourseRow(row.key, 'course_name', e.target.value)}
                  />
                  <input
                    className="input !py-1.5 !text-sm text-center"
                    placeholder="3"
                    type="number"
                    min={1}
                    max={6}
                    value={row.credits}
                    onChange={e => updateCourseRow(row.key, 'credits', e.target.value)}
                  />
                  <button
                    onClick={() => removeCourseRow(row.key)}
                    disabled={courseRows.length === 1}
                    className="text-slate-500 hover:text-red-400 text-xl leading-none disabled:opacity-30"
                  >×</button>
                </div>
              ))}
            </div>
            <button onClick={addCourseRow} className="text-amber-400 hover:text-amber-300 text-sm mb-4 block">
              + Add another course
            </button>
            {courseEntryError && <p className="text-red-400 text-sm mb-3 bg-red-900/20 px-3 py-2 rounded-lg">{courseEntryError}</p>}
            <button onClick={handleSaveCourses} disabled={savingCourses} className="btn-primary w-full">
              {savingCourses ? 'Saving…' : 'Continue →'}
            </button>
          </div>
        )}

        {/* Step: Review courses (subsequent rounds) */}
        {step === 'course_review' && (
          <div className="card">
            <h3 className="font-semibold text-white mb-1">Your Courses — {activeRound?.name}</h3>
            <p className="text-slate-400 text-sm mb-4">
              Review your course list. If you&apos;ve dropped a class since last round, mark it here.
            </p>
            <div className="space-y-2 mb-5">
              {courses.map(c => {
                const alreadyDropped = c.status === 'dropped'
                const pendingDrop = pendingDrops.includes(c.course_id)
                const isDropped = alreadyDropped || pendingDrop
                const isEditing = editingId === c.id

                if (isEditing) {
                  return (
                    <div key={c.id} className="border border-amber-500/40 bg-slate-800/60 rounded-lg px-3 py-3">
                      <div className="grid grid-cols-[1fr_2fr_60px] gap-2 mb-2">
                        <input
                          className="input !py-1.5 !text-sm uppercase placeholder:normal-case"
                          placeholder="ENGR 110"
                          value={editValues.course_id}
                          onChange={e => setEditValues(v => ({ ...v, course_id: e.target.value }))}
                        />
                        <input
                          className="input !py-1.5 !text-sm"
                          placeholder="Course Name"
                          value={editValues.course_name}
                          onChange={e => setEditValues(v => ({ ...v, course_name: e.target.value }))}
                        />
                        <input
                          className="input !py-1.5 !text-sm text-center"
                          placeholder="3"
                          type="number"
                          min={1}
                          max={6}
                          value={editValues.credits}
                          onChange={e => setEditValues(v => ({ ...v, credits: e.target.value }))}
                        />
                      </div>
                      {editError && <p className="text-red-400 text-xs mb-2">{editError}</p>}
                      <div className="flex gap-2">
                        <button onClick={saveEdit} disabled={editSaving} className="btn-primary text-xs py-1 px-3">
                          {editSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingId(null); setEditError('') }} className="btn-secondary text-xs py-1 px-3">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={c.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                    isDropped ? 'border-red-800/40 bg-red-900/10' : 'border-slate-700 bg-slate-800/40'
                  }`}>
                    <div className="flex-1 min-w-0 mr-3">
                      <p className={`font-medium text-sm ${isDropped ? 'text-slate-500 line-through' : 'text-white'}`}>
                        {c.course_id} — {c.course_name}
                      </p>
                      <p className="text-slate-500 text-xs">{c.credits} credit{c.credits !== 1 ? 's' : ''}</p>
                    </div>
                    {alreadyDropped && !pendingDrop ? (
                      <span className="text-red-400 text-xs font-medium shrink-0">Dropped</span>
                    ) : pendingDrop ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-red-400 text-xs font-medium">Will drop</span>
                        <button
                          onClick={() => setPendingDrops(prev => prev.filter(id => id !== c.course_id))}
                          className="text-xs text-slate-400 hover:text-slate-200 underline"
                        >Undo</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-xs text-slate-400 hover:text-amber-400 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleDrop(c.course_id, c.course_name)}
                          className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                        >
                          Mark as dropped
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {pendingDrops.length > 0 && (
              <p className="text-amber-400 text-xs mb-3 bg-amber-900/20 px-3 py-2 rounded-lg">
                ⚠️ {pendingDrops.length} course{pendingDrops.length !== 1 ? 's' : ''} marked as dropped. The VP of Academics & Scholarship will be notified when you continue.
              </p>
            )}

            {/* Add new courses */}
            {!showAddCourse ? (
              <button onClick={() => setShowAddCourse(true)} className="text-amber-400 hover:text-amber-300 text-sm mb-4 block">
                + Add a course
              </button>
            ) : (
              <div className="mb-4 border border-slate-700 rounded-lg p-3 bg-slate-800/40">
                <p className="text-slate-300 text-xs font-medium mb-2">New courses to add:</p>
                <div className="mb-1 hidden sm:grid sm:grid-cols-[1fr_2fr_60px_28px] gap-2">
                  <span className="text-slate-500 text-xs">Course ID</span>
                  <span className="text-slate-500 text-xs">Course Name</span>
                  <span className="text-slate-500 text-xs text-center">Credits</span>
                  <span />
                </div>
                <div className="space-y-2 mb-2">
                  {newCourseRows.map(row => (
                    <div key={row.key} className="grid grid-cols-[1fr_2fr_60px_28px] gap-2 items-center">
                      <input
                        className="input !py-1.5 !text-sm uppercase placeholder:normal-case"
                        placeholder="ENGR 110"
                        value={row.course_id}
                        onChange={e => setNewCourseRows(prev => prev.map(r => r.key === row.key ? { ...r, course_id: e.target.value } : r))}
                      />
                      <input
                        className="input !py-1.5 !text-sm"
                        placeholder="Course Name"
                        value={row.course_name}
                        onChange={e => setNewCourseRows(prev => prev.map(r => r.key === row.key ? { ...r, course_name: e.target.value } : r))}
                      />
                      <input
                        className="input !py-1.5 !text-sm text-center"
                        placeholder="3"
                        type="number"
                        min={1}
                        max={6}
                        value={row.credits}
                        onChange={e => setNewCourseRows(prev => prev.map(r => r.key === row.key ? { ...r, credits: e.target.value } : r))}
                      />
                      <button
                        onClick={() => setNewCourseRows(prev => prev.length > 1 ? prev.filter(r => r.key !== row.key) : prev)}
                        disabled={newCourseRows.length === 1}
                        className="text-slate-500 hover:text-red-400 text-xl leading-none disabled:opacity-30"
                      >×</button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setNewCourseRows(prev => [...prev, { key: Date.now().toString(), course_id: '', course_name: '', credits: '' }])}
                    className="text-amber-400 hover:text-amber-300 text-xs"
                  >+ Add another</button>
                  <button
                    onClick={() => { setShowAddCourse(false); setNewCourseRows([{ key: '1', course_id: '', course_name: '', credits: '' }]); setAddCourseError('') }}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                  >Cancel</button>
                </div>
                {addCourseError && <p className="text-red-400 text-xs mt-2">{addCourseError}</p>}
              </div>
            )}

            <button onClick={handleContinueFromReview} disabled={savingDrops} className="btn-primary w-full">
              {savingDrops ? 'Saving…' : `Continue${pendingDrops.length > 0 ? ` (${pendingDrops.length} dropped)` : ''} →`}
            </button>
          </div>
        )}

        {/* Step: Choose upload path */}
        {step === 'choose' && (
          <div className="grid md:grid-cols-2 gap-4">
            <label
              htmlFor="grade-photo"
              className="card text-left hover:border-amber-500 border-2 border-transparent transition-colors cursor-pointer block"
            >
              <p className="text-3xl mb-3">📷</p>
              <p className="font-bold text-white text-lg">Upload Blackboard Screenshot</p>
              <p className="text-slate-400 text-sm mt-1">Take a screenshot (not a camera photo) of your Blackboard grades page. We&apos;ll read your GPA automatically.</p>
            </label>
            <button
              onClick={() => setStep('no_grade')}
              className="card text-left hover:border-slate-500 border-2 border-transparent transition-colors cursor-pointer"
            >
              <p className="text-3xl mb-3">🚫</p>
              <p className="font-bold text-white text-lg">No Grades for Any Course Yet</p>
              <p className="text-slate-400 text-sm mt-1">Grades haven&apos;t been posted for any of your courses yet. This will be noted by the VP of Academics & Scholarship.</p>
            </button>
          </div>
        )}

        {/* Step: OCR loading */}
        {step === 'ocr' && (
          <div className="card text-center py-12">
            <div className="inline-block w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-white font-semibold">Reading your grade…</p>
            <p className="text-slate-400 text-sm mt-1">OCR is scanning your Blackboard screenshot</p>
          </div>
        )}

        {/* Step: Confirm OCR result */}
        {step === 'confirm' && ocrState && (
          <div className="space-y-4">
            {preview && (
              <div className="card !p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Grade screenshot" className="max-h-64 object-contain w-full rounded" />
              </div>
            )}
            <div className="card">
              <h3 className="font-semibold text-white mb-3">OCR Result</h3>
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400 text-sm">Detection confidence:</p>
                <span className={`text-sm font-medium ${confidenceColors[ocrState.confidence]}`}>
                  {confidenceLabel[ocrState.confidence]}
                </span>
              </div>
                <div>
                <label className="label">Detected Grade</label>
                {lowQualityFlag ? (
                  <p className="text-amber-400 text-sm bg-amber-900/20 px-3 py-2 rounded-lg">
                    ⚠️ Flagged as unclear — the VP of Academics & Scholarship will review your photo manually.
                  </p>
                ) : ocrState?.directGpa != null ? (
                  <p className="text-2xl font-bold text-white mt-1">
                    {ocrState.directGpa.toFixed(2)}
                    <span className="text-slate-400 text-base font-normal ml-2">GPA detected directly</span>
                  </p>
                ) : selectedGrade ? (
                  <p className="text-2xl font-bold text-white mt-1">{selectedGrade} <span className="text-slate-400 text-base font-normal">({GRADE_MAP[selectedGrade]?.toFixed(1)} GPA pts)</span></p>
                ) : (
                  <p className="text-slate-400 text-sm mt-1">No grade detected — the VP of Academics & Scholarship will review your photo.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLowQualityFlag(f => !f)}
                className={`mt-3 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  lowQualityFlag
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200'
                }`}
              >
                {lowQualityFlag ? '✓ Flagged as unclear' : 'Photo is hard to read'}
              </button>
              {Object.keys(ocrState.courseGrades).length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <p className="text-slate-400 text-xs mb-2">Detected course grades — verify these look correct:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(ocrState.courseGrades).map(([course, grade]) => (
                      <span key={course} className="text-xs bg-slate-800 px-2.5 py-1 rounded-full">
                        <span className="text-slate-400">{course}</span>{' '}
                        <span className="font-semibold text-white">{grade}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {ocrState.confidence === 'none' && (
                <p className="text-amber-400 text-sm mt-2 bg-amber-900/20 px-3 py-2 rounded-lg">
                  {ocrFailed
                    ? '⚠️ Scan failed — please select your grade manually from the dropdown above.'
                    : '⚠️ No grade found in your screenshot. Please select your grade from the dropdown above.'}
                </p>
              )}
            </div>
            {/* Per-course no-grade flags */}
            {courses.filter(c => c.status === 'active').length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-white mb-1">Any courses without a grade yet?</h3>
                <p className="text-slate-400 text-sm mb-3">Check any course whose grades haven&apos;t been posted yet. The VP will see this.</p>
                <div className="space-y-2">
                  {courses.filter(c => c.status === 'active').map(c => {
                    const normalizedId = c.course_id.replace(/\s+/g, '').toUpperCase()
                    const detected = Object.entries(ocrState.courseGrades).find(
                      ([k]) => k.replace(/\s+/g, '').toUpperCase() === normalizedId
                    )
                    const isNoGrade = perCourseNoGrade.has(c.course_id)
                    return (
                      <label key={c.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        isNoGrade ? 'border-amber-600/40 bg-amber-900/10' : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                      }`}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isNoGrade}
                            onChange={() => setPerCourseNoGrade(prev => {
                              const next = new Set(prev)
                              if (next.has(c.course_id)) next.delete(c.course_id)
                              else next.add(c.course_id)
                              return next
                            })}
                            className="rounded"
                          />
                          <div>
                            <p className="text-sm text-white">{c.course_id} — {c.course_name}</p>
                            <p className="text-xs text-slate-500">{c.credits} credit{c.credits !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          {isNoGrade ? (
                            <span className="text-amber-400 text-xs font-medium">No grade yet</span>
                          ) : detected ? (
                            <span className="text-green-400 text-xs font-medium">Detected: {detected[1]}</span>
                          ) : (
                            <span className="text-slate-500 text-xs">Not detected</span>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            {error && <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep('choose')} className="btn-secondary flex-1">← Back</button>
              <button onClick={handleSubmitPhoto} className="btn-primary flex-1" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Grade'}
              </button>
            </div>
          </div>
        )}

        {/* Step: Grades not posted yet */}
        {step === 'not_posted' && (
          <div className="card text-center py-10">
            <p className="text-4xl mb-4">⏳</p>
            <h3 className="text-white font-semibold text-lg mb-2">No Current Grade</h3>
            <p className="text-slate-400 text-sm mb-2">
              Come back before <strong className="text-amber-400">{new Date(activeDeadline).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong> to submit your grades once they&apos;re posted.
            </p>
            <p className="text-slate-500 text-xs mb-6">Nothing has been recorded — you can return to this page at any time before the deadline.</p>
            <button onClick={() => router.push('/dashboard')} className="btn-primary px-8">Back to Dashboard</button>
            <button onClick={() => setStep('choose')} className="btn-secondary px-6 ml-3">← Back</button>
          </div>
        )}

        {/* Step: No grade confirmation */}
        {step === 'no_grade' && (
          <div className="card text-center py-10">
            <p className="text-4xl mb-4">🚫</p>
            <h3 className="text-white font-semibold text-lg mb-2">Confirm: No Grades for Any Course Yet</h3>
            <p className="text-slate-400 text-sm mb-6">
              You are indicating that you have no grades to report for <strong className="text-white">{pageTitle}</strong>.
              The VP of Academics & Scholarship will be notified.
            </p>
            {error && <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg mb-4">{error}</p>}
            <div className="flex gap-3 justify-center">
              <button onClick={() => setStep('choose')} className="btn-secondary px-6">← Back</button>
              <button onClick={handleNoGrade} className="btn-primary px-6" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Confirm No Grade'}
              </button>
            </div>
          </div>
        )}

      </div>
    </Layout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { redirect, supabase, session } = await requireAuth(ctx)
  if (redirect) return { redirect }

  const semesterId = ctx.params?.semesterId as string

  const { data: semester } = await supabase.from('semesters').select('*').eq('id', semesterId).single()
  if (!semester) return { notFound: true }

  // Find the active round for this semester (most recent if multiple active somehow)
  const { data: activeRound } = await supabase
    .from('semester_rounds')
    .select('*')
    .eq('semester_id', semesterId)
    .eq('is_active', true)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Check for existing submission (per-round if round exists, per-semester otherwise)
  // Declined submissions don't block resubmission — only active/reviewed ones do
  let alreadySubmitted = false
  let declinedReason: string | null = null
  if (activeRound) {
    const { data: existing } = await supabase
      .from('submissions').select('id,status,decline_reason').eq('member_id', session!.user.id).eq('round_id', activeRound.id).maybeSingle()
    if (existing?.status === 'declined') {
      declinedReason = existing.decline_reason ?? ''
    } else {
      alreadySubmitted = !!existing
    }
  } else {
    const { data: existing } = await supabase
      .from('submissions').select('id,status,decline_reason').eq('member_id', session!.user.id).eq('semester_id', semesterId).maybeSingle()
    if (existing?.status === 'declined') {
      declinedReason = existing.decline_reason ?? ''
    } else {
      alreadySubmitted = !!existing
    }
  }

  // Load member's course list for this semester
  const { data: memberCourses } = await supabase
    .from('member_courses')
    .select('*')
    .eq('member_id', session!.user.id)
    .eq('semester_id', semesterId)
    .order('created_at', { ascending: true })

  return { props: { semester, alreadySubmitted, activeRound: activeRound ?? null, memberCourses: memberCourses ?? [], declinedReason } }
}
