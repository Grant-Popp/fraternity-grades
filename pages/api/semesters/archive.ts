import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await requireAdminFromRequest(req)
  if (!user) return res.status(403).json({ error: 'Forbidden' })

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

  // Remove member course lists for this semester
  await supabaseAdmin.from('member_courses').delete().eq('semester_id', semesterId)

  // Deactivate the semester
  await supabaseAdmin.from('semesters').update({ is_active: false }).eq('id', semesterId)

  return res.status(200).json({ ok: true, photosDeleted })
}
