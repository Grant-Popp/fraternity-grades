import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createClient } from '@supabase/supabase-js'
import { parse } from 'cookie'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  // Verify admin
  const cookies = parse(req.headers.cookie ?? '')
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]
  const raw = cookies[`sb-${projectRef}-auth-token`] ?? cookies['sb-access-token']
  let token: string | null = null
  try { token = raw ? JSON.parse(decodeURIComponent(raw)).access_token ?? raw : null } catch { token = raw ?? null }
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { semesterId } = req.body
  if (!semesterId) return res.status(400).json({ error: 'semesterId required' })

  // Get all photo paths for this semester
  const { data: submissions } = await supabaseAdmin
    .from('submissions')
    .select('id, photo_url')
    .eq('semester_id', semesterId)
    .not('photo_url', 'is', null)

  const photoPaths = (submissions ?? []).map((s: any) => s.photo_url).filter(Boolean) as string[]
  let photosDeleted = 0

  // Delete photos from storage in batches of 100
  if (photoPaths.length > 0) {
    const { error: storageError } = await supabaseAdmin.storage
      .from('grade-photos')
      .remove(photoPaths)
    if (!storageError) photosDeleted = photoPaths.length
  }

  // Clear photo_url on submissions (keep grade data)
  await supabaseAdmin
    .from('submissions')
    .update({ photo_url: null, photo_phash: null })
    .eq('semester_id', semesterId)

  // Deactivate the semester
  await supabaseAdmin.from('semesters').update({ is_active: false }).eq('id', semesterId)

  return res.status(200).json({ ok: true, photosDeleted })
}
