import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await requireAdminFromRequest(req)
  if (!user) return res.status(403).json({ error: 'Forbidden' })

  const { semesterId } = req.body
  if (!semesterId) return res.status(400).json({ error: 'semesterId required' })

  const { data: pending } = await supabaseAdmin
    .from('submissions')
    .select('id, ocr_gpa')
    .eq('semester_id', semesterId)
    .eq('status', 'pending')
    .eq('duplicate_flag', false)
    .eq('no_grade', false)

  if (!pending?.length) return res.json({ approved: 0 })

  const eligible = pending.filter(s => s.ocr_gpa != null)
  if (eligible.length === 0) return res.json({ approved: 0 })

  const now = new Date().toISOString()
  await Promise.all(
    eligible.map(sub =>
      supabaseAdmin.from('submissions').update({
        status: 'reviewed',
        admin_gpa: sub.ocr_gpa,
        final_gpa: sub.ocr_gpa,
        reviewed_at: now,
      } as any).eq('id', sub.id)
    )
  )

  return res.json({ approved: eligible.length })
}
