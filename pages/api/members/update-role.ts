import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserFromRequest } from '@/lib/apiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { memberId, role } = req.body
  if (!memberId || typeof memberId !== 'string') return res.status(400).json({ error: 'memberId required' })
  if (!['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' })

  // Prevent self-demotion — would lock the admin panel if they're the only admin
  if (memberId === user.id && role === 'member') {
    return res.status(400).json({ error: 'You cannot remove your own admin access.' })
  }

  // Verify the target member actually exists in the chapter
  const { data: target } = await supabaseAdmin.from('profiles').select('id,full_name,role').eq('id', memberId).maybeSingle()
  if (!target) return res.status(404).json({ error: 'Member not found' })

  const { error } = await supabaseAdmin.from('profiles').update({ role }).eq('id', memberId)
  if (error) return res.status(500).json({ error: error.message })

  const { data: actor } = await supabaseAdmin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  console.log(`[audit] role_change: ${actor?.full_name ?? user.id} changed ${target.full_name} from ${target.role} → ${role}`)
  await supabaseAdmin.from('audit_logs' as any).insert({
    admin_id: user.id,
    action: 'role_change',
    target_id: memberId,
    details: { from: target.role, to: role, actor: actor?.full_name },
  }).then(() => {}).catch(() => {})

  return res.status(200).json({ ok: true })
}
