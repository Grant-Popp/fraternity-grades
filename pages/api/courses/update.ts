import type { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()
  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { memberCourseId, course_id, course_name, credits } = req.body ?? {}
  if (!memberCourseId) return res.status(400).json({ error: 'memberCourseId required' })
  if (!course_id?.trim() || course_id.trim().length > 20) return res.status(400).json({ error: 'Invalid course ID' })
  if (!course_name?.trim() || course_name.trim().length > 100) return res.status(400).json({ error: 'Invalid course name' })
  const cr = Number(credits)
  if (!Number.isInteger(cr) || cr < 1 || cr > 6) return res.status(400).json({ error: 'Credits must be 1–6' })

  // Verify the row belongs to this user
  const { data: existing } = await supabaseAdmin
    .from('member_courses').select('id,member_id').eq('id', memberCourseId).maybeSingle()
  if (!existing || existing.member_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  const { error } = await supabaseAdmin
    .from('member_courses')
    .update({ course_id: course_id.toUpperCase().trim(), course_name: course_name.trim(), credits: cr })
    .eq('id', memberCourseId)

  if (error) return res.status(400).json({ error: error.message })
  return res.json({ ok: true })
}
