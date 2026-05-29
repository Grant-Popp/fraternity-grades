import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'
import { gradeToGpa } from '@/lib/gpa'
import { computePhash, isDuplicate } from '@/lib/phash'
import formidable from 'formidable'
import fs from 'fs'
import sharp from 'sharp'

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
      const editingTools = ['photoshop', 'gimp', 'lightroom', 'affinity', 'paint.net', 'pixelmator', 'snapseed', 'vsco', 'canva', 'picsart', 'facetune', 'corel', 'photoscape', 'luminar', 'darktable', 'rawtherapee']
      if (editingTools.some(t => sw.includes(t))) duplicate_flag = true
    }
  } catch {
    // EXIF parse failure — no EXIF data (normal for screenshots)
  }

  // ── Anti-cheat: image resolution ────────────────────────────
  // Real grade portal screenshots are at least 400×400px. Tiny images suggest
  // a cropped, synthetic, or placeholder screenshot.
  try {
    const meta = await sharp(fileBuffer).metadata()
    if ((meta.width ?? 999) < 400 || (meta.height ?? 999) < 400) duplicate_flag = true
  } catch {}

  // ── Anti-cheat: file size sanity ─────────────────────────────
  // A <5 KB file with substantial OCR text suggests a synthetic/generated image —
  // real screenshots with text content are always larger.
  if (fileBuffer.length < 5000 && ocrRawText && ocrRawText.length > 100) {
    duplicate_flag = true
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
  // Catches identical or near-identical images reused across ANY past submission
  // (any semester, any round, any status). Threshold 8 (tightened from 10).
  // When a match is found, ALL matching submissions from other members are
  // retroactively flagged regardless of their current status or semester.
  try {
    photo_phash = await computePhash(fileBuffer)
    const { data: allPastSubs } = await supabaseAdmin
      .from('submissions')
      .select('id, photo_phash, member_id')
      .not('photo_phash', 'is', null)
      .limit(2000)
    const currentHash = photo_phash
    const allHashes = (allPastSubs ?? []).map((s: any) => s.photo_phash).filter(Boolean) as string[]
    if (isDuplicate(currentHash, allHashes, 8)) {
      duplicate_flag = true
      // Retroactively flag every matching submission from another member, cross-semester
      const toFlag = (allPastSubs ?? []).filter((s: any) =>
        s.photo_phash && s.member_id !== user.id && isDuplicate(currentHash, [s.photo_phash], 8)
      )
      if (toFlag.length > 0) {
        await Promise.all(toFlag.map((s: any) =>
          supabaseAdmin.from('submissions').update({ duplicate_flag: true }).eq('id', s.id)
        ))
      }
    }
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
      'moodle', 'banner', 'semester', 'enrolled', 'gradebook', 'cumulative', 'academic', 'transcript',
      'louisville', 'ulink', 'attempt', 'submitted']
    // Blackboard counts double — it's the definitive portal for this chapter
    const kwHits = portalKeywords.filter(kw => ocrLower.includes(kw)).length
      + (ocrLower.includes('blackboard') ? 1 : 0)
    if (kwHits < 2) duplicate_flag = true
  }

  // Use directGpa (precise numeric) if OCR detected it; otherwise convert from letter grade
  const directGpaVal = directGpaRaw ? parseFloat(directGpaRaw) : NaN
  const ocrGpa = (!isNaN(directGpaVal) && directGpaVal >= 0 && directGpaVal <= 4.0)
    ? directGpaVal
    : (ocrGrade ? gradeToGpa(ocrGrade) : null)

  // ── Anti-cheat 5: Cross-member OCR uniqueness ────────────────
  // If another member in the same semester/round submitted identical OCR text,
  // they are sharing the same screenshot (the first 300 chars are compared).
  if (!duplicate_flag && ocrRawText && ocrRawText.length > 100) {
    const ocrQuery = supabaseAdmin.from('submissions')
      .select('ocr_raw_text').neq('member_id', user.id).not('ocr_raw_text', 'is', null)
    const { data: peerOcr } = await (roundId
      ? ocrQuery.eq('round_id', roundId)
      : ocrQuery.eq('semester_id', semesterId))
    const prefix = ocrRawText.substring(0, 300)
    if (peerOcr?.some(s => s.ocr_raw_text != null && s.ocr_raw_text.startsWith(prefix))) duplicate_flag = true
  }

  // ── Anti-cheat 6: Semester year match ──────────────────────
  // If the semester name contains a 4-digit year (e.g. "Fall 2025"), the OCR
  // text must contain that year — catches prior-semester screenshots.
  if (!duplicate_flag && ocrRawText && ocrRawText.length > 50) {
    const yearMatch = semester.name.match(/\b(20\d{2})\b/)
    if (yearMatch && !ocrRawText.includes(yearMatch[1])) duplicate_flag = true
  }

  // ── Anti-cheat 7: GPA mathematical consistency ───────────────
  // If 3+ course grades were extracted, compute an unweighted GPA estimate and
  // compare to the OCR GPA. Tolerance of 0.7 accounts for credit-hour weighting.
  if (!duplicate_flag && ocrGpa !== null && Object.keys(courseGradesData).length >= 3) {
    const LETTER_GPA: Record<string, number> = {
      'A+': 4.0, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D+': 1.3, 'D': 1.0, 'D-': 0.7, 'F': 0.0,
    }
    const numericGrades = Object.values(courseGradesData)
      .map(g => LETTER_GPA[g.trim().replace(/\s/g, '').toUpperCase()])
      .filter((v): v is number => v !== undefined)
    if (numericGrades.length >= 3) {
      const computedGpa = numericGrades.reduce((a, b) => a + b, 0) / numericGrades.length
      if (Math.abs(computedGpa - ocrGpa) > 0.7) duplicate_flag = true
    }
  }

  // ── Anti-cheat 8: Minimum OCR text length ───────────────────
  // A real grade page should produce at least 40 characters of OCR text.
  // Very short OCR suggests a blank screenshot or a mocked submission.
  if (!duplicate_flag && ocrRawText.trim().length < 40) duplicate_flag = true

  // ── Anti-cheat 9: Digit presence check ──────────────────────
  // Real grade pages contain numbers (credit hours, GPAs, course codes).
  // Substantial OCR text with fewer than 3 digits is not a grade page.
  if (!duplicate_flag && ocrRawText && ocrRawText.length > 100) {
    const digitCount = (ocrRawText.match(/\d/g) ?? []).length
    if (digitCount < 3) duplicate_flag = true
  }

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
