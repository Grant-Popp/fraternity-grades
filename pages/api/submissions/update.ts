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
  if (!submissionId) return res.status(400).json({ error: 'submissionId required' })
  if (adminGpa !== undefined && adminGpa !== null && (typeof adminGpa !== 'number' || adminGpa < 0 || adminGpa > 4.0)) {
    return res.status(400).json({ error: 'GPA must be between 0.0 and 4.0' })
  }
  const VALID_STATUSES = ['pending', 'reviewed', 'no_grade']
  if (status && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' })
  if (adminNotes && adminNotes.length > 1000) return res.status(400).json({ error: 'Notes must be 1000 characters or less' })

  const { data: sub } = await supabaseAdmin
    .from('submissions')
    .select('ocr_gpa, member_id, semester_id, profiles(full_name, email), semesters(name)')
    .eq('id', submissionId)
    .maybeSingle()
  if (!sub) return res.status(404).json({ error: 'Submission not found' })

  const finalGpa = adminGpa ?? (sub as any).ocr_gpa

  const { error } = await supabaseAdmin.from('submissions').update({
    admin_gpa: adminGpa ?? null,
    final_gpa: finalGpa,
    status: status ?? 'reviewed',
    admin_notes: adminNotes ?? null,
    reviewed_at: new Date().toISOString(),
  }).eq('id', submissionId)

  if (error) return res.status(500).json({ error: error.message })

  // Send approval email when marking as reviewed
  if ((status ?? 'reviewed') === 'reviewed') {
    try {
      const memberProfile = (sub as any).profiles
      const semester = (sub as any).semesters
      if (memberProfile && semester) {
        const { sendEmail } = await import('@/lib/email')
        await sendEmail({
          to: memberProfile.email,
          memberName: memberProfile.full_name,
          semesterName: semester.name,
          type: 'approved',
          finalGpa: finalGpa ?? undefined,
        })
      }
    } catch {}
  }

  return res.status(200).json({ ok: true, finalGpa })
}
