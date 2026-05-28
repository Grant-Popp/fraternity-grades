import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()

  const user = await requireAdminFromRequest(req)
  if (!user) return res.status(403).json({ error: 'Forbidden' })

  const { memberId, adminNotes } = req.body
  if (!memberId) return res.status(400).json({ error: 'memberId required' })
  if (adminNotes && adminNotes.length > 1000) return res.status(400).json({ error: 'Notes must be 1000 characters or less.' })

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ admin_notes: adminNotes?.trim() || null } as any)
    .eq('id', memberId)

  if (error) return res.status(500).json({ error: 'Failed to update notes.' })
  return res.json({ ok: true })
}
