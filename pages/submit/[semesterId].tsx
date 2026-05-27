import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'
import type { Semester } from '@/lib/database.types'
import Layout from '@/components/layout/Layout'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { GRADE_MAP } from '@/lib/gpa'

interface Props {
  semester: Semester
  alreadySubmitted: boolean
}

type Step = 'choose' | 'upload' | 'ocr' | 'confirm' | 'no_grade' | 'done'

interface OcrState {
  rawText: string
  detectedGrade: string | null
  gpa: number | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  allGrades: string[]
}

export default function SubmitPage({ semester, alreadySubmitted }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [ocrFailed, setOcrFailed] = useState(false)

  // Revoke blob URL on cleanup to prevent memory leaks
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrState, setOcrState] = useState<OcrState | null>(null)
  const [selectedGrade, setSelectedGrade] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isPastDeadline = new Date(semester.deadline) < new Date()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return

    const MAX_MB = 5
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large. Please upload an image under ${MAX_MB}MB. Screenshots are usually well under 1MB.`)
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
    } catch {
      setOcrFailed(true)
      setOcrState({ rawText: '', detectedGrade: null, gpa: null, confidence: 'none', allGrades: [] })
    } finally {
      setOcrLoading(false)
      setStep('confirm')
    }
  }

  const handleSubmitPhoto = async () => {
    if (!file) return
    setSubmitting(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('semesterId', semester.id)
    formData.append('ocrRawText', ocrState?.rawText ?? '')
    formData.append('ocrGrade', selectedGrade)
    formData.append('noGrade', 'false')

    const res = await fetch('/api/submissions/create', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Submission failed.')
      setSubmitting(false)
      return
    }
    setStep('done')
    setSubmitting(false)
  }

  const handleNoGrade = async () => {
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/submissions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semesterId: semester.id, noGrade: true }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Submission failed.'); setSubmitting(false); return }
    setStep('done')
    setSubmitting(false)
  }

  const confidenceColors: Record<string, string> = {
    high: 'text-green-400', medium: 'text-yellow-400', low: 'text-orange-400', none: 'text-red-400',
  }
  const confidenceLabel: Record<string, string> = {
    high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence (percentage fallback)', none: 'Grade not detected',
  }

  if (alreadySubmitted) {
    return (
      <Layout title={semester.name}>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-white font-semibold text-lg">Already submitted</p>
          <p className="text-slate-400 text-sm mt-1">You&apos;ve already submitted grades for {semester.name}.</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary mt-6">Back to Dashboard</button>
        </div>
      </Layout>
    )
  }

  if (isPastDeadline) {
    return (
      <Layout title={semester.name}>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <p className="text-4xl mb-3">⏰</p>
          <p className="text-white font-semibold text-lg">Deadline has passed</p>
          <p className="text-slate-400 text-sm mt-1">The submission window for {semester.name} is closed.</p>
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
          <p className="text-slate-400 mb-6">Your grade for <strong className="text-white">{semester.name}</strong> has been submitted. The VP of Academics will review it shortly.</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary px-8">Back to Dashboard</button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={`Submit Grades — ${semester.name}`}>
      <div className="max-w-2xl mx-auto">
        <div className="card mb-4 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm">Semester</p>
            <p className="text-white font-semibold">{semester.name}</p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-sm">Deadline</p>
            <p className="text-amber-400 font-semibold text-sm">{new Date(semester.deadline).toLocaleString()}</p>
          </div>
        </div>

        {/* Choose path */}
        {step === 'choose' && (
          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={() => { setStep('upload'); setTimeout(() => fileRef.current?.click(), 100) }}
              className="card text-left hover:border-amber-500 border-2 border-transparent transition-colors cursor-pointer"
            >
              <p className="text-3xl mb-3">📷</p>
              <p className="font-bold text-white text-lg">Upload Blackboard Screenshot</p>
              <p className="text-slate-400 text-sm mt-1">Take a screenshot of your Blackboard grades page and upload it. We&apos;ll read your grade automatically.</p>
            </button>

            <button
              onClick={() => setStep('no_grade')}
              className="card text-left hover:border-slate-500 border-2 border-transparent transition-colors cursor-pointer"
            >
              <p className="text-3xl mb-3">🚫</p>
              <p className="font-bold text-white text-lg">No Grade This Semester</p>
              <p className="text-slate-400 text-sm mt-1">Select this if you are not enrolled or taking classes this semester.</p>
            </button>
          </div>
        )}

        {/* Hidden file input */}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        {/* Upload trigger */}
        {step === 'upload' && (
          <div className="card text-center py-12 border-2 border-dashed border-slate-600 cursor-pointer"
            onClick={() => fileRef.current?.click()}>
            <p className="text-4xl mb-3">📤</p>
            <p className="text-white font-semibold">Click to select your screenshot</p>
            <p className="text-slate-400 text-sm mt-1">Supported: JPG, PNG, GIF, WebP</p>
          </div>
        )}

        {/* OCR loading */}
        {step === 'ocr' && (
          <div className="card text-center py-12">
            <div className="inline-block w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-white font-semibold">Reading your grade…</p>
            <p className="text-slate-400 text-sm mt-1">OCR is scanning your Blackboard screenshot</p>
          </div>
        )}

        {/* OCR result + confirm */}
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
                <label className="label">Detected Grade (verify or correct)</label>
                <select className="input" value={selectedGrade} onChange={e => setSelectedGrade(e.target.value)}>
                  <option value="">— Select grade —</option>
                  {Object.keys(GRADE_MAP).map(g => (
                    <option key={g} value={g}>{g} ({GRADE_MAP[g].toFixed(1)} GPA pts)</option>
                  ))}
                </select>
                {ocrState.allGrades.length > 1 && (
                  <p className="text-xs text-slate-400 mt-1">All detected grades: {ocrState.allGrades.join(', ')}</p>
                )}
              </div>

              {ocrState.confidence === 'none' && (
                <p className="text-amber-400 text-sm mt-2 bg-amber-900/20 px-3 py-2 rounded-lg">
                  {ocrFailed
                    ? '⚠️ Scan failed — please select your grade manually from the dropdown above.'
                    : '⚠️ No grade found in your screenshot. Please select your grade from the dropdown above.'}
                </p>
              )}
            </div>

            {error && <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setStep('choose')} className="btn-secondary flex-1">← Back</button>
              <button onClick={handleSubmitPhoto} className="btn-primary flex-1" disabled={!selectedGrade || submitting}>
                {submitting ? 'Submitting…' : 'Submit Grade'}
              </button>
            </div>
          </div>
        )}

        {/* No grade confirmation */}
        {step === 'no_grade' && (
          <div className="card text-center py-10">
            <p className="text-4xl mb-4">🚫</p>
            <h3 className="text-white font-semibold text-lg mb-2">Confirm: No Grade This Semester</h3>
            <p className="text-slate-400 text-sm mb-6">
              You are indicating that you have no grades to report for <strong className="text-white">{semester.name}</strong>. This will be recorded and reviewed by the VP of Academics.
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

  const { data: existing } = await supabase.from('submissions')
    .select('id').eq('member_id', session!.user.id).eq('semester_id', semesterId).single()

  return { props: { semester, alreadySubmitted: !!existing } }
}
