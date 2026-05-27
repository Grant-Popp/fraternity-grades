import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { submissionId, adminGpa, status, adminNotes } = req.body

  const { data: sub } = await supabaseAdmin.from('submissions').select('ocr_gpa').eq('id', submissionId).single()
  if (!sub) return res.status(404).json({ error: 'Submission not found' })

  const finalGpa = adminGpa ?? sub.ocr_gpa

  const { error } = await supabaseAdmin.from('submissions').update({
    admin_gpa: adminGpa ?? null,
    final_gpa: finalGpa,
    status: status ?? 'reviewed',
    admin_notes: adminNotes ?? null,
    reviewed_at: new Date().toISOString(),
  }).eq('id', submissionId)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true, finalGpa })
}
