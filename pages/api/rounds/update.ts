import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminFromRequest } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()
  const admin = await requireAdminFromRequest(req)
  if (!admin) return res.status(403).json({ error: 'Forbidden' })

  const { roundId, isActive, deadline } = req.body ?? {}
  if (!roundId) return res.status(400).json({ error: 'roundId required' })

  const update: Record<string, unknown> = {}
  if (typeof isActive === 'boolean') update.is_active = isActive
  if (deadline) {
    if (isNaN(Date.parse(deadline))) return res.status(400).json({ error: 'Invalid deadline' })
    const { data: round } = await supabaseAdmin.from('semester_rounds').select('semester_id').eq('id', roundId).maybeSingle()
    if (round) {
      const { data: parentSem } = await supabaseAdmin.from('semesters').select('deadline').eq('id', round.semester_id).maybeSingle()
      if (parentSem && new Date(deadline) > new Date(parentSem.deadline)) {
        return res.status(400).json({ error: 'Round deadline cannot be after the semester deadline' })
      }
    }
    update.deadline = deadline
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nothing to update' })

  const { error } = await supabaseAdmin.from('semester_rounds').update(update).eq('id', roundId)
  if (error) return res.status(400).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
