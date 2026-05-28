import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { submissionId } = req.body
  if (!submissionId) return res.status(400).json({ error: 'submissionId required' })

  const { data: sub } = await supabaseAdmin
    .from('submissions')
    .select('id,member_id,status,photo_url,round_id,semester_id')
    .eq('id', submissionId)
    .maybeSingle()

  if (!sub) return res.status(404).json({ error: 'Submission not found' })
  if (sub.member_id !== user.id) return res.status(403).json({ error: 'Forbidden' })
  if (sub.status !== 'pending' && sub.status !== 'no_grade') return res.status(400).json({ error: 'Only pending or no-grade submissions can be withdrawn' })

  // Check that the deadline hasn't passed
  let deadline: string | null = null
  if (sub.round_id) {
    const { data: round } = await supabaseAdmin.from('semester_rounds').select('deadline').eq('id', sub.round_id).maybeSingle()
    deadline = round?.deadline ?? null
  } else {
    const { data: sem } = await supabaseAdmin.from('semesters').select('deadline').eq('id', sub.semester_id).maybeSingle()
    deadline = sem?.deadline ?? null
  }
  if (deadline && new Date(deadline) < new Date()) {
    return res.status(400).json({ error: 'Deadline has passed — contact the VP of Academics & Scholarship to make changes' })
  }

  // Delete photo from storage if present
  if (sub.photo_url) {
    await supabaseAdmin.storage.from('grade-photos').remove([sub.photo_url])
  }

  const { error } = await supabaseAdmin.from('submissions').delete().eq('id', submissionId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}
