import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role,email,full_name').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { semesterId, threshold, atRiskMembers } = req.body
  if (!semesterId || !Array.isArray(atRiskMembers)) return res.status(400).json({ error: 'Invalid request' })

  const { data: sem } = await supabaseAdmin.from('semesters').select('name').eq('id', semesterId).maybeSingle()
  if (!sem) return res.status(404).json({ error: 'Semester not found' })

  try {
    const { sendEmail } = await import('@/lib/email')
    await sendEmail({
      to: callerProfile.email,
      memberName: callerProfile.full_name,
      semesterName: sem.name,
      type: 'at_risk_summary',
      threshold,
      atRiskMembers,
    })
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Failed to send email' })
  }
}
