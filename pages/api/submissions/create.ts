import type { NextApiRequest, NextApiResponse } from 'next'
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { gradeToGpa } from '@/lib/gpa'
import { computePhash, isDuplicate } from '@/lib/phash'
import formidable from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const supabase = createPagesServerClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const contentType = req.headers['content-type'] ?? ''

  // JSON path: no-grade submission
  if (contentType.includes('application/json')) {
    const body = await new Promise<any>((resolve) => {
      let data = ''
      req.on('data', chunk => { data += chunk })
      req.on('end', () => resolve(JSON.parse(data)))
    })

    const { semesterId, noGrade } = body

    const { data: semester } = await supabaseAdmin.from('semesters').select('deadline').eq('id', semesterId).single()
    if (!semester) return res.status(404).json({ error: 'Semester not found' })
    if (new Date(semester.deadline) < new Date()) return res.status(400).json({ error: 'Submission deadline has passed' })

    const { error } = await supabaseAdmin.from('submissions').insert({
      member_id: session.user.id,
      semester_id: semesterId,
      no_grade: true,
      status: 'no_grade',
    })
    if (error) return res.status(400).json({ error: error.message })

    // Send confirmation email
    try {
      const { data: profile } = await supabaseAdmin.from('profiles').select('full_name,email').eq('id', session.user.id).single()
      const { data: sem } = await supabaseAdmin.from('semesters').select('name').eq('id', semesterId).single()
      if (profile && sem) {
        const { sendEmail } = await import('@/lib/email')
        await sendEmail({ to: profile.email, memberName: profile.full_name, semesterName: sem.name, type: 'confirmation' })
      }
    } catch {}

    return res.status(200).json({ ok: true })
  }

  // Multipart path: photo submission
  const form = formidable({ maxFileSize: 20 * 1024 * 1024 })
  const [fields, files] = await form.parse(req)

  const semesterId = Array.isArray(fields.semesterId) ? fields.semesterId[0] : fields.semesterId
  const ocrRawText = Array.isArray(fields.ocrRawText) ? fields.ocrRawText[0] : fields.ocrRawText ?? ''
  const ocrGrade = Array.isArray(fields.ocrGrade) ? fields.ocrGrade[0] : fields.ocrGrade ?? ''
  const imageFile = Array.isArray(files.file) ? files.file[0] : files.file

  if (!semesterId || !imageFile) return res.status(400).json({ error: 'Missing required fields' })

  const { data: semester } = await supabaseAdmin.from('semesters').select('deadline,name').eq('id', semesterId).single()
  if (!semester) return res.status(404).json({ error: 'Semester not found' })
  if (new Date(semester.deadline) < new Date()) return res.status(400).json({ error: 'Submission deadline has passed' })

  // Check for existing submission
  const { data: existing } = await supabaseAdmin.from('submissions')
    .select('id').eq('member_id', session.user.id).eq('semester_id', semesterId).single()
  if (existing) return res.status(400).json({ error: 'Already submitted for this semester' })

  // Upload photo to Supabase Storage
  const fileBuffer = fs.readFileSync(imageFile.filepath)
  const ext = imageFile.originalFilename?.split('.').pop() ?? 'jpg'
  const storagePath = `${session.user.id}/${semesterId}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('grade-photos')
    .upload(storagePath, fileBuffer, { contentType: imageFile.mimetype ?? 'image/jpeg', upsert: true })

  if (uploadError) return res.status(500).json({ error: 'Photo upload failed' })

  // Compute perceptual hash and check for duplicates
  let photo_phash: string | null = null
  let duplicate_flag = false
  try {
    photo_phash = await computePhash(fileBuffer)
    const { data: prevSubs } = await supabaseAdmin
      .from('submissions')
      .select('photo_phash')
      .eq('member_id', session.user.id)
      .not('photo_phash', 'is', null)
    const existingHashes = (prevSubs ?? []).map((s: any) => s.photo_phash).filter(Boolean) as string[]
    duplicate_flag = isDuplicate(photo_phash, existingHashes)
  } catch {}

  const ocrGpa = ocrGrade ? gradeToGpa(ocrGrade) : null

  const { error: insertError } = await supabaseAdmin.from('submissions').insert({
    member_id: session.user.id,
    semester_id: semesterId,
    photo_url: storagePath,
    no_grade: false,
    ocr_raw_text: ocrRawText,
    ocr_gpa: ocrGpa,
    final_gpa: ocrGpa,
    status: 'pending',
    photo_phash,
    duplicate_flag,
  })

  if (insertError) return res.status(500).json({ error: insertError.message })

  // Send confirmation email
  try {
    const { data: profile } = await supabaseAdmin.from('profiles').select('full_name,email').eq('id', session.user.id).single()
    if (profile) {
      const { sendEmail } = await import('@/lib/email')
      await sendEmail({ to: profile.email, memberName: profile.full_name, semesterName: semester.name, type: 'confirmation' })
    }
  } catch {}

  return res.status(200).json({ ok: true, duplicateFlag: duplicate_flag })
}
