import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminFromRequest } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const admin = await requireAdminFromRequest(req)
  if (!admin) return res.status(403).json({ error: 'Forbidden' })

  const { semesterId, name, deadline } = req.body ?? {}
  if (!semesterId || !name || !deadline) return res.status(400).json({ error: 'semesterId, name, and deadline required' })
  if (typeof name !== 'string' || name.trim().length > 100) return res.status(400).json({ error: 'Round name must be 100 characters or less' })
  if (isNaN(Date.parse(deadline))) return res.status(400).json({ error: 'Invalid deadline' })

  const { data: existing } = await supabaseAdmin
    .from('semester_rounds')
    .select('round_number')
    .eq('semester_id', semesterId)
    .order('round_number', { ascending: false })
    .limit(1)

  const nextRound = (existing?.[0]?.round_number ?? 0) + 1

  const { data: round, error } = await supabaseAdmin
    .from('semester_rounds')
    .insert({ semester_id: semesterId, round_number: nextRound, name: name.trim(), deadline, is_active: true })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(200).json({ round })
}
