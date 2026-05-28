import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()

  const user = await requireAdminFromRequest(req)
  if (!user) return res.status(403).json({ error: 'Forbidden' })

  const { memberId, action } = req.body
  if (!memberId || !['add', 'remove', 'reset'].includes(action)) {
    return res.status(400).json({ error: 'Invalid request.' })
  }

  if (action === 'reset') {
    await supabaseAdmin.from('profiles').update({ strikes: 0 } as any).eq('id', memberId)
    return res.json({ strikes: 0 })
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('strikes').eq('id', memberId).maybeSingle()
  const current = (profile as any)?.strikes ?? 0
  const next = action === 'add' ? current + 1 : Math.max(0, current - 1)

  await supabaseAdmin.from('profiles').update({ strikes: next } as any).eq('id', memberId)
  return res.json({ strikes: next })
}
