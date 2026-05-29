import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { data } = await supabaseAdmin
    .from('chapter_settings' as any)
    .select('signup_code')
    .eq('id', 1)
    .maybeSingle()

  const storedCode: string | null = (data as any)?.signup_code ?? null

  // No code set = open signup, always valid
  if (!storedCode) return res.status(200).json({ ok: true })

  const { code } = req.body
  if (!code || typeof code !== 'string') {
    return res.status(403).json({ error: 'An invite code is required to sign up.' })
  }

  if (code.trim().toUpperCase() !== storedCode.toUpperCase()) {
    // Slow-down on wrong code: makes brute-forcing 8-char hex codes impractical
    await new Promise(r => setTimeout(r, 800))
    return res.status(403).json({ error: 'Invalid invite code. Get the current code from your VP of Academics.' })
  }

  return res.status(200).json({ ok: true })
}
