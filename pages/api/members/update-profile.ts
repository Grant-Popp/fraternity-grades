import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

const CLASS_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { full_name, class_year, major } = req.body

  if (!full_name?.trim()) return res.status(400).json({ error: 'Name is required.' })
  if (full_name.trim().length > 100) return res.status(400).json({ error: 'Name is too long.' })
  if (!CLASS_YEARS.includes(class_year)) return res.status(400).json({ error: 'Invalid class year.' })

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ full_name: full_name.trim(), class_year, major: major?.trim() || null })
    .eq('id', user.id)

  if (error) return res.status(500).json({ error: 'Failed to update profile.' })
  return res.json({ ok: true })
}
