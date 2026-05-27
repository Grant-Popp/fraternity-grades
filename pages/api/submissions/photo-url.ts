import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { submissionId } = req.query
  if (!submissionId || typeof submissionId !== 'string') {
    return res.status(400).json({ error: 'submissionId required' })
  }

  const { data: sub } = await supabaseAdmin
    .from('submissions').select('photo_url').eq('id', submissionId).maybeSingle()
  if (!sub?.photo_url) return res.status(404).json({ error: 'No photo for this submission' })

  const { data } = await supabaseAdmin.storage
    .from('grade-photos').createSignedUrl(sub.photo_url, 3600)
  if (!data?.signedUrl) return res.status(500).json({ error: 'Could not generate photo URL' })

  return res.status(200).json({ url: data.signedUrl })
}
