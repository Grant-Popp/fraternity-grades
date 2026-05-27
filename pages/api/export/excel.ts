import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'
import { generateExcel, generateAllSemestersExcel } from '@/lib/excel'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const semesterId = req.query.semesterId as string
  if (!semesterId) return res.status(400).json({ error: 'semesterId is required' })

  const { data: members } = await supabaseAdmin.from('profiles').select('*').eq('role', 'member').order('full_name')

  if (semesterId === 'all') {
    const { data: semesters } = await supabaseAdmin.from('semesters').select('*').order('created_at', { ascending: true })
    const { data: submissions } = await supabaseAdmin.from('submissions').select('*')
    const buffer = await generateAllSemestersExcel(members ?? [], submissions ?? [], semesters ?? [])
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="all-semesters-grades.xlsx"')
    return res.send(buffer)
  }

  const { data: semester } = await supabaseAdmin.from('semesters').select('*').eq('id', semesterId).single()
  if (!semester) return res.status(404).json({ error: 'Semester not found' })

  const { data: submissions } = await supabaseAdmin.from('submissions').select('*').eq('semester_id', semesterId)

  const buffer = await generateExcel(members ?? [], submissions ?? [], semester)

  const filename = `grades-${semester.name.replace(/\s+/g, '-').toLowerCase()}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(buffer)
}
