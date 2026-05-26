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

  const { semesterId, deadline, name, isActive } = req.body

  const updates: Record<string, any> = {}
  if (deadline !== undefined) updates.deadline = deadline
  if (name !== undefined) updates.name = name
  if (isActive !== undefined) updates.is_active = isActive

  const { error } = await supabaseAdmin.from('semesters').update(updates).eq('id', semesterId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}
