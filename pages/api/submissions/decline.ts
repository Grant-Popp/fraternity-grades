import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { submissionId, declineReason } = req.body
  if (!submissionId) return res.status(400).json({ error: 'submissionId required' })
  if (declineReason && declineReason.length > 500) return res.status(400).json({ error: 'Reason must be 500 characters or less' })

  const { data: sub } = await supabaseAdmin
    .from('submissions')
    .select('id,member_id,semester_id,round_id,profiles(full_name,email),semesters(name)')
    .eq('id', submissionId)
    .maybeSingle()

  if (!sub) return res.status(404).json({ error: 'Submission not found' })

  const { error } = await supabaseAdmin.from('submissions').update({
    status: 'declined',
    decline_reason: declineReason ?? null,
    reviewed_at: new Date().toISOString(),
  } as any).eq('id', submissionId)

  if (error) return res.status(500).json({ error: error.message })

  try {
    const { sendEmail } = await import('@/lib/email')
    const memberProfile = sub.profiles as any
    const semester = sub.semesters as any
    if (memberProfile && semester) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
      const submitUrl = `${siteUrl}/submit/${sub.semester_id}`
      await sendEmail({
        to: memberProfile.email,
        memberName: memberProfile.full_name,
        semesterName: semester.name,
        type: 'declined',
        declineReason: declineReason ?? undefined,
        submitUrl,
      })
    }
  } catch {}

  return res.status(200).json({ ok: true })
}
