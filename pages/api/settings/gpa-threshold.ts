import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { data } = await (supabaseAdmin.from('chapter_settings' as any).select('gpa_threshold').maybeSingle())
    return res.status(200).json({ threshold: (data as any)?.gpa_threshold ?? 2.5 })
  }

  if (req.method === 'PATCH') {
    const { threshold } = req.body
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 4.0) {
      return res.status(400).json({ error: 'Threshold must be between 0.0 and 4.0' })
    }
    await (supabaseAdmin.from('chapter_settings' as any).upsert({ id: 1, gpa_threshold: threshold }))
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
