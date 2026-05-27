import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminFromRequest } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()
  const admin = await requireAdminFromRequest(req)
  if (!admin) return res.status(403).json({ error: 'Forbidden' })

  const { alertId } = req.body ?? {}
  if (!alertId) return res.status(400).json({ error: 'alertId required' })

  const { error } = await supabaseAdmin
    .from('drop_alerts')
    .update({ acknowledged: true })
    .eq('id', alertId)

  if (error) return res.status(400).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
