import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { name, deadline } = req.body
  if (!name || !deadline) return res.status(400).json({ error: 'Name and deadline are required' })

  const { data: semester, error } = await supabaseAdmin.from('semesters').insert({ name, deadline }).select().single()
  if (error) return res.status(400).json({ error: error.message })

  return res.status(200).json({ semester })
}
