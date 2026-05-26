import type { NextApiRequest, NextApiResponse } from 'next'
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()

  const supabase = createPagesServerClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', session.user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { memberId, role } = req.body
  if (!['member','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' })

  const { error } = await supabaseAdmin.from('profiles').update({ role }).eq('id', memberId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}
