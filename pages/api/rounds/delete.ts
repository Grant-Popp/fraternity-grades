import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { roundId } = req.body
  if (!roundId) return res.status(400).json({ error: 'roundId required' })

  // Fetch all submissions for this round that have photos
  const { data: subs } = await supabaseAdmin
    .from('submissions')
    .select('id, photo_url')
    .eq('round_id', roundId)

  if (subs && subs.length > 0) {
    const photoPaths = subs.filter(s => s.photo_url).map(s => s.photo_url as string)
    if (photoPaths.length > 0) {
      await supabaseAdmin.storage.from('grade-photos').remove(photoPaths)
    }

    const ids = subs.map(s => s.id)
    await supabaseAdmin.from('submissions').delete().in('id', ids)
  }

  const { error } = await supabaseAdmin.from('semester_rounds').delete().eq('id', roundId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ deleted: subs?.length ?? 0 })
}
