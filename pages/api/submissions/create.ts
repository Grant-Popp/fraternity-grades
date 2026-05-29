import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'
import { gradeToGpa } from '@/lib/gpa'
import { computePhash, isDuplicate } from '@/lib/phash'
import formidable from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const contentType = req.headers['content-type'] ?? ''

  // JSON path: no-grade submission
  if (contentType.includes('application/json')) {
    let body: any
    try {
      body = await new Promise<any>((resolve, reject) => {
        let data = ''
        req.on('data', chunk => { data += chunk })
        req.on('end', () => { try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid JSON')) } })
        req.on('error', reject)
      })
    } catch {
      return res.status(400).json({ error: 'Invalid request body' })
    }

    const { semesterId, roundId } = body
    if (!semesterId) return res.status(400).json({ error: 'semesterId required' })

    // Deadline check: use round deadline if round provided, else semester deadline
    let effectiveDeadline: string
    if (roundId) {
      const { data: round } = await supabaseAdmin.from('semester_rounds').select('deadline').eq('id', roundId).maybeSingle()
      if (!round) return res.status(404).json({ error: 'Round not found' })
      effectiveDeadline = round.deadline
    } else {
      const { data: sem } = await supabaseAdmin.from('semesters').select('deadline').eq('id', semesterId).maybeSingle()
      if (!sem) return res.status(404).json({ error: 'Semester not found' })
      effectiveDeadline = sem.deadline
    }
    if (new Date(effectiveDeadline) < new Date()) return res.status(400).json({ error: 'Submission deadline has passed' })

    const { data: semester } = await supabaseAdmin.from('semesters').select('deadline,name,required_years').eq('id', semesterId).single()
    if (!semester) return res.status(404).json({ error: 'Semester not found' })

    if (semester.required_years?.length) {
      const { data: mp } = await supabaseAdmin.from('profiles').select('class_year').eq('id', user.id).maybeSingle()
      if (!mp || !semester.required_years.includes(mp.class_year)) {
        return res.status(403).json({ error: 'You are not required to submit for this semester.' })
      }
    }

    // Check for duplicate submission in same round (or semester for legacy)
    // Declined submissions don't block resubmission
    if (roundId) {
      const { data: dup } = await supabaseAdmin.from('submissions').select('id').eq('member_id', user.id).eq('round_id', roundId).neq('status', 'declined').maybeSingle()
      if (dup) return res.status(400).json({ error: 'Already submitted for this round' })
    } else {
      const { data: dup } = await supabaseAdmin.from('submissions').select('id').eq('member_id', user.id).eq('semester_id', semesterId).neq('status', 'declined').maybeSingle()
      if (dup) return res.status(400).json({ error: 'Already submitted for this semester' })
    }

    const { error } = await supabaseAdmin.from('submissions').insert({
      member_id: user.id,
      semester_id: semesterId,
      round_id: roundId ?? null,
      no_grade: true,
      status: 'no_grade',
    })
    if (error) return res.status(400).json({ error: error.message })

    try {
      const { data: profile } = await supabaseAdmin.from('profiles').select('full_name,email').eq('id', user.id).single()
      const { data: sem } = await supabaseAdmin.from('semesters').select('name').eq('id', semesterId).single()
      if (profile && sem) {
        const { sendEmail } = await import('@/lib/email')
        await sendEmail({ to: profile.email, memberName: profile.full_name, semesterName: sem.name, type: 'confirmation' })
      }
    } catch (err: any) {
      console.error('[email] confirmation send failed:', err?.message)
    }

    return res.status(200).json({ ok: true })
  }

  // Multipart path: photo submission
  const form = formidable({ maxFileSize: 5 * 1024 * 1024 })
  let fields: any, files: any
  try {
    const parsed = await form.parse(req)
    fields = parsed[0]
    files = parsed[1]
  } catch {
    return res.status(400).json({ error: 'Invalid upload. Please try again.' })
  }

  const semesterId = Array.isArray(fields.semesterId) ? fields.semesterId[0] : fields.semesterId
  const roundId = Array.isArray(fields.roundId) ? fields.roundId[0] : fields.roundId ?? null
  const ocrRawTextRaw = Array.isArray(fields.ocrRawText) ? fields.ocrRawText[0] : fields.ocrRawText ?? ''
  const ocrRawText = ocrRawTextRaw.substring(0, 5000) // cap to prevent oversized DB payloads
  const ocrGrade = Array.isArray(fields.ocrGrade) ? fields.ocrGrade[0] : fields.ocrGrade ?? ''
  const courseGradesRaw = Array.isArray(fields.courseGrades) ? fields.courseGrades[0] : fields.courseGrades ?? '{}'
  const directGpaRaw = Array.isArray(fields.directGpa) ? fields.directGpa[0] : fields.directGpa ?? ''
  const imageFile = Array.isArray(files.file) ? files.file[0] : files.file

  let courseGradesData: Record<string, string> = {}
  if (courseGradesRaw && courseGradesRaw !== '{}') {
    try {
      const parsed = JSON.parse(courseGradesRaw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed)
        if (entries.length <= 20) {
          for (const [k, v] of entries) {
            if (typeof k === 'string' && typeof v === 'string' && k.length <= 30 && v.length <= 20) {
              courseGradesData[k] = v
            }
          }
        }
      }
    } catch {}
  }

  if (!semesterId || !imageFile) return res.status(400).json({ error: 'Missing required fields' })

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(imageFile.mimetype ?? '')) {
    return res.status(400).json({ error: 'Only image files are allowed (JPG, PNG, WebP, GIF)' })
  }

  const { data: semester } = await supabaseAdmin.from('semesters').select('deadline,name,required_years').eq('id', semesterId).single()
  if (!semester) return res.status(404).json({ error: 'Semester not found' })

  // Use round deadline if round provided, otherwise semester deadline
  let effectiveDeadline = semester.deadline
  if (roundId) {
    const { data: round } = await supabaseAdmin.from('semester_rounds').select('deadline').eq('id', roundId).maybeSingle()
    if (!round) return res.status(404).json({ error: 'Round not found' })
    effectiveDeadline = round.deadline
  }
  if (new Date(effectiveDeadline) < new Date()) return res.status(400).json({ error: 'Submission deadline has passed' })

  if (semester.required_years?.length) {
    const { data: mp } = await supabaseAdmin.from('profiles').select('class_year').eq('id', user.id).maybeSingle()
    if (!mp || !semester.required_years.includes(mp.class_year)) {
      return res.status(403).json({ error: 'You are not required to submit for this semester.' })
    }
  }

  // Duplicate check: by round if round-based, else by semester
  // Declined submissions don't block resubmission
  if (roundId) {
    const { data: existing } = await supabaseAdmin.from('submissions').select('id').eq('member_id', user.id).eq('round_id', roundId).neq('status', 'declined').maybeSingle()
    if (existing) return res.status(400).json({ error: 'Already submitted for this round' })
  } else {
    const { data: existing } = await supabaseAdmin.from('submissions').select('id').eq('member_id', user.id).eq('semester_id', semesterId).neq('status', 'declined').maybeSingle()
    if (existing) return res.status(400).json({ error: 'Already submitted for this semester' })
  }

  // Read file safely
  let fileBuffer: Buffer
  try {
    fileBuffer = fs.readFileSync(imageFile.filepath)
  } catch {
    return res.status(400).json({ error: 'File could not be read. Please try again.' })
  }

  // Declare anti-cheat flags early so all checks below can set them
  let photo_phash: string | null = null
  let duplicate_flag = false

  // ── Anti-cheat 1: EXIF analysis ──────────────────────────────
  // Camera photos (phones) embed EXIF; screenshots typically don't.
  // Catches: old photos re-used from prior semesters, image-editing software.
  try {
    const ExifReader = (await import('exifreader')).default
    const tags = ExifReader.load(fileBuffer)

    // Photo age — reject camera shots taken more than 45 days ago
    const dateTag = (tags as any)['DateTimeOriginal'] ?? (tags as any)['DateTime']
    if (dateTag?.description) {
      const exifDate = (dateTag.description as string).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
      const photoDate = new Date(exifDate)
      if (!isNaN(photoDate.getTime())) {
        const daysOld = (Date.now() - photoDate.getTime()) / (1000 * 60 * 60 * 24)
        if (daysOld > 14) {
          return res.status(400).json({ error: `This photo was taken ${Math.round(daysOld)} days ago. Please take a new screenshot of your current grades (must be within the last 14 days).` })
        }
      }
    }

    // Editing software — Photoshop/GIMP/Lightroom in EXIF means the image was modified
    const softwareTag = (tags as any)['Software']
    if (softwareTag?.description) {
      const sw = (softwareTag.description as string).toLowerCase()
      const editingTools = ['photoshop', 'gimp', 'lightroom', 'affinity', 'paint.net', 'pixelmator', 'snapseed', 'vsco']
      if (editingTools.some(t => sw.includes(t))) duplicate_flag = true
    }
  } catch {
    // EXIF parse failure — no EXIF data (normal for screenshots)
  }

  const ext = imageFile.originalFilename?.split('.').pop()?.toLowerCase() ?? 'jpg'
  // Include roundId so Round 1 and Round 2 photos don't overwrite each other
  const pathSuffix = roundId ? `${semesterId}_${roundId}` : `${semesterId}_legacy`
  const storagePath = `${user.id}/${pathSuffix}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('grade-photos')
    .upload(storagePath, fileBuffer, { contentType: imageFile.mimetype ?? 'image/jpeg', upsert: true })

  if (uploadError) return res.status(500).json({ error: 'Photo upload failed' })

  // ── Anti-cheat 2: Perceptual hash ────────────────────────────
  // Catches identical or near-identical images reused across submissions.
  try {
    photo_phash = await computePhash(fileBuffer)
    const hashQuery = supabaseAdmin.from('submissions').select('photo_phash').not('photo_phash', 'is', null)
    const scoped = roundId ? hashQuery.eq('round_id', roundId) : hashQuery.eq('semester_id', semesterId)
    const { data: scopedSubs } = await scoped
    const { data: ownSubs } = await supabaseAdmin.from('submissions').select('photo_phash').eq('member_id', user.id).not('photo_phash', 'is', null)
    const allHashes = [
      ...(scopedSubs ?? []).map((s: any) => s.photo_phash),
      ...(ownSubs ?? []).map((s: any) => s.photo_phash),
    ].filter(Boolean) as string[]
    if (isDuplicate(photo_phash, allHashes)) duplicate_flag = true
  } catch {}

  // ── Anti-cheat 3: Identity checks ───────────────────────────
  // Require the member's name to appear in the OCR text (flags someone else's screenshot).
  // Require at least half of their registered courses to appear (catches wrong-semester screenshots).
  const { data: memberProfile } = await supabaseAdmin.from('profiles').select('full_name,email').eq('id', user.id).single()

  if (memberProfile?.full_name && ocrRawText) {
    const nameParts = memberProfile.full_name.trim().toLowerCase().split(/\s+/)
    const firstName = nameParts[0]
    const lastName = nameParts[nameParts.length - 1]
    const ocrLower = ocrRawText.toLowerCase()
    const hasFirst = firstName.length > 2 && ocrLower.includes(firstName)
    const hasLast = lastName.length > 2 && ocrLower.includes(lastName)
    if (!hasFirst && !hasLast) duplicate_flag = true
  }

  // Course ID cross-reference — member's registered course IDs should appear in the OCR text.
  // If they have 3+ courses and none show up, it's almost certainly not their grades page.
  if (!duplicate_flag && ocrRawText && ocrRawText.length > 80) {
    const { data: memberCourses } = await supabaseAdmin
      .from('member_courses').select('course_id')
      .eq('member_id', user.id).eq('semester_id', semesterId).eq('status', 'active')
    if (memberCourses && memberCourses.length >= 3) {
      const ocrUpper = ocrRawText.toUpperCase().replace(/\s+/g, ' ')
      const matched = memberCourses.filter(c => {
        const norm = c.course_id.replace(/\s+/g, ' ').toUpperCase()
        const compact = c.course_id.replace(/\s+/g, '').toUpperCase()
        return ocrUpper.includes(norm) || ocrUpper.includes(compact)
      })
      if (matched.length === 0) duplicate_flag = true
    }
  }

  // ── Anti-cheat 4: Grade portal keyword check ─────────────────
  // If substantial OCR text was returned but contains no academic keywords,
  // the screenshot probably isn't from a grade portal.
  if (!duplicate_flag && ocrRawText && ocrRawText.length > 100) {
    const ocrLower = ocrRawText.toLowerCase()
    const portalKeywords = ['grade', 'gpa', 'credit', 'course', 'points', 'blackboard', 'canvas',
      'moodle', 'banner', 'semester', 'enrolled', 'gradebook', 'cumulative', 'academic', 'transcript']
    const kwHits = portalKeywords.filter(kw => ocrLower.includes(kw)).length
    if (kwHits < 2) duplicate_flag = true
  }

  // Use directGpa (precise numeric) if OCR detected it; otherwise convert from letter grade
  const directGpaVal = directGpaRaw ? parseFloat(directGpaRaw) : NaN
  const ocrGpa = (!isNaN(directGpaVal) && directGpaVal >= 0 && directGpaVal <= 4.0)
    ? directGpaVal
    : (ocrGrade ? gradeToGpa(ocrGrade) : null)

  const { error: insertError } = await supabaseAdmin.from('submissions').insert({
    member_id: user.id,
    semester_id: semesterId,
    photo_url: storagePath,
    no_grade: false,
    round_id: roundId ?? null,
    ocr_raw_text: ocrRawText,
    ocr_gpa: ocrGpa,
    final_gpa: ocrGpa,
    status: 'pending',
    photo_phash,
    duplicate_flag,
    course_grades: Object.keys(courseGradesData).length > 0 ? courseGradesData : null,
  })

  // Clean up orphaned storage file if insert failed
  if (insertError) {
    await supabaseAdmin.storage.from('grade-photos').remove([storagePath])
    return res.status(500).json({ error: insertError.message })
  }

  try {
    if (memberProfile) {
      const { sendEmail } = await import('@/lib/email')
      await sendEmail({ to: memberProfile.email, memberName: memberProfile.full_name, semesterName: semester.name, type: 'confirmation' })
    }
  } catch (err: any) {
    console.error('[email] confirmation send failed:', err?.message)
  }

  return res.status(200).json({ ok: true, duplicateFlag: duplicate_flag })
}
