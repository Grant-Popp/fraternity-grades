import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { semesterId } = req.body
  if (!semesterId) return res.status(400).json({ error: 'semesterId required' })

  // Only delete photos from reviewed or declined submissions — never pending ones
  const { data: subs } = await supabaseAdmin
    .from('submissions')
    .select('id, photo_url')
    .eq('semester_id', semesterId)
    .not('photo_url', 'is', null)
    .in('status', ['reviewed', 'declined'])

  if (!subs || subs.length === 0) return res.status(200).json({ deleted: 0 })

  const paths = subs.map(s => s.photo_url as string)

  // Remove from storage (ignore individual failures)
  await supabaseAdmin.storage.from('grade-photos').remove(paths)

  // Null out photo_url on those submissions
  const ids = subs.map(s => s.id)
  await supabaseAdmin.from('submissions').update({ photo_url: null } as any).in('id', ids)

  return res.status(200).json({ deleted: subs.length })
}
