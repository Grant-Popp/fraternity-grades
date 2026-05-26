import type { NextApiRequest, NextApiResponse } from 'next'
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { generateExcel } from '@/lib/excel'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const supabase = createPagesServerClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', session.user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const semesterId = req.query.semesterId as string
  if (!semesterId) return res.status(400).json({ error: 'semesterId is required' })

  const { data: semester } = await supabaseAdmin.from('semesters').select('*').eq('id', semesterId).single()
  if (!semester) return res.status(404).json({ error: 'Semester not found' })

  const { data: members } = await supabaseAdmin.from('profiles').select('*').eq('role', 'member').order('full_name')
  const { data: submissions } = await supabaseAdmin.from('submissions').select('*').eq('semester_id', semesterId)

  const buffer = await generateExcel(members ?? [], submissions ?? [], semester)

  const filename = `grades-${semester.name.replace(/\s+/g, '-').toLowerCase()}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(buffer)
}
