import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'
import { sendEmail, type EmailType } from '@/lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { semesterId, type, classYears }: { semesterId: string; type: EmailType; classYears?: string[] } = req.body

  const { data: semester } = await supabaseAdmin.from('semesters').select('name,deadline').eq('id', semesterId).single()
  if (!semester) return res.status(404).json({ error: 'Semester not found' })

  // Rate limit: prevent sending the same email type for a semester more than once per 60 seconds
  const debounceWindow = new Date(Date.now() - 60 * 1000).toISOString()
  const { count: recentSendCount } = await supabaseAdmin.from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('semester_id', semesterId)
    .eq('type', type)
    .gte('sent_at', debounceWindow)
  if ((recentSendCount ?? 0) > 0) {
    return res.status(429).json({ error: 'Please wait at least 60 seconds before sending again.' })
  }

  let query = supabaseAdmin.from('profiles').select('id,full_name,email').eq('role', 'member')
  if (classYears && classYears.length > 0) query = query.in('class_year', classYears)
  const { data: members } = await query
  const { data: submitted } = await supabaseAdmin.from('submissions').select('member_id').eq('semester_id', semesterId)
  const submittedIds = new Set((submitted ?? []).map((s: any) => s.member_id))
  const targets = (members ?? []).filter(m => !submittedIds.has(m.id))

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentLogs } = await supabaseAdmin.from('email_logs')
    .select('member_id')
    .eq('semester_id', semesterId)
    .eq('type', type)
    .gte('sent_at', cutoff)
  const recentIds = new Set((recentLogs ?? []).map((l: any) => l.member_id))

  const toSend = targets.filter(m => !recentIds.has(m.id))
  const skipped = targets.length - toSend.length

  const deadline = new Date(semester.deadline).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  const submitUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/submit/${semesterId}`

  let sent = 0
  const errors: string[] = []

  for (const m of toSend) {
    try {
      await sendEmail({ to: m.email, memberName: m.full_name, semesterName: semester.name, deadline, submitUrl, type })
      await supabaseAdmin.from('email_logs').insert({ semester_id: semesterId, member_id: m.id, type })
      sent++
    } catch (err: any) {
      errors.push(`${m.email}: ${err.message}`)
    }
  }

  return res.status(200).json({ sent, skipped, errors })
}
