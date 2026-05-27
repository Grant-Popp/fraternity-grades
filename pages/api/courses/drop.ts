import type { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { semesterId, courseId } = req.body ?? {}
  if (!semesterId || !courseId) return res.status(400).json({ error: 'semesterId and courseId required' })

  const { data: course } = await supabaseAdmin
    .from('member_courses')
    .select('*')
    .eq('member_id', user.id)
    .eq('semester_id', semesterId)
    .eq('course_id', courseId)
    .maybeSingle()

  if (!course) return res.status(404).json({ error: 'Course not found' })
  if (course.status === 'dropped') return res.status(200).json({ ok: true })

  await supabaseAdmin
    .from('member_courses')
    .update({ status: 'dropped', dropped_at: new Date().toISOString() })
    .eq('id', course.id)

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()

  await supabaseAdmin.from('drop_alerts').insert({
    member_id: user.id,
    semester_id: semesterId,
    course_id: courseId,
    course_name: course.course_name,
    credits: course.credits,
    member_name: profile?.full_name ?? 'Unknown',
  })

  return res.status(200).json({ ok: true })
}
