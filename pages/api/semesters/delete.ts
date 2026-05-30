import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).end()

  const user = await requireAdminFromRequest(req)
  if (!user) return res.status(403).json({ error: 'Forbidden' })

  const { semesterId } = req.body
  if (!semesterId) return res.status(400).json({ error: 'semesterId required' })

  // Delete photo files from storage first
  const { data: subs } = await supabaseAdmin
    .from('submissions').select('photo_url').eq('semester_id', semesterId).not('photo_url', 'is', null)
  const photoPaths = (subs ?? []).map((s: any) => s.photo_url).filter(Boolean) as string[]
  if (photoPaths.length > 0) {
    await supabaseAdmin.storage.from('grade-photos').remove(photoPaths)
  }

  // Delete submissions, rounds, then semester (order matters for FK constraints)
  await supabaseAdmin.from('submissions').delete().eq('semester_id', semesterId)
  await supabaseAdmin.from('semester_rounds').delete().eq('semester_id', semesterId)
  const { error } = await supabaseAdmin.from('semesters').delete().eq('id', semesterId)
  if (error) return res.status(500).json({ error: error.message })

  return res.json({ ok: true })
}
