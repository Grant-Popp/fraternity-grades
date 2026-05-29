import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'
import crypto from 'crypto'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { data } = await supabaseAdmin.from('chapter_settings' as any).select('signup_code').eq('id', 1).maybeSingle()
    return res.status(200).json({ code: (data as any)?.signup_code ?? null })
  }

  if (req.method === 'POST') {
    // Generate a new 8-char alphanumeric code
    const newCode = crypto.randomBytes(4).toString('hex').toUpperCase()
    await supabaseAdmin.from('chapter_settings' as any).upsert({ id: 1, signup_code: newCode } as any)
    return res.status(200).json({ code: newCode })
  }

  if (req.method === 'DELETE') {
    await supabaseAdmin.from('chapter_settings' as any).update({ signup_code: null } as any).eq('id', 1)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
