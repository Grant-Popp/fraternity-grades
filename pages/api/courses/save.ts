import type { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

interface CourseInput {
  course_id: string
  course_name: string
  credits: number
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { semesterId, courses } = req.body ?? {}
  if (!semesterId || !Array.isArray(courses)) return res.status(400).json({ error: 'semesterId and courses array required' })
  if (courses.length === 0) return res.status(400).json({ error: 'At least one course required' })
  if (courses.length > 12) return res.status(400).json({ error: 'Too many courses (max 12)' })

  for (const c of courses as CourseInput[]) {
    if (!c.course_id || typeof c.course_id !== 'string' || c.course_id.trim().length > 20)
      return res.status(400).json({ error: 'Invalid course ID' })
    if (!c.course_name || typeof c.course_name !== 'string' || c.course_name.trim().length > 100)
      return res.status(400).json({ error: 'Invalid course name' })
    if (typeof c.credits !== 'number' || c.credits < 1 || c.credits > 6)
      return res.status(400).json({ error: 'Credits must be between 1 and 6' })
  }

  const { data: semester } = await supabaseAdmin
    .from('semesters').select('id,is_active').eq('id', semesterId).maybeSingle()
  if (!semester?.is_active) return res.status(400).json({ error: 'Semester is not active' })

  const { error } = await supabaseAdmin.from('member_courses').upsert(
    (courses as CourseInput[]).map(c => ({
      member_id: user.id,
      semester_id: semesterId,
      course_id: c.course_id.toUpperCase().trim(),
      course_name: c.course_name.trim(),
      credits: Math.floor(c.credits),
      status: 'active',
    })),
    { onConflict: 'member_id,semester_id,course_id' }
  )

  if (error) return res.status(400).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
