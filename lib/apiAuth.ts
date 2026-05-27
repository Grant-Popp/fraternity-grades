import type { NextApiRequest } from 'next'
import { parse } from 'cookie'
import { supabaseAdmin } from './supabaseAdmin'

export async function getUserFromRequest(req: NextApiRequest) {
  const cookies = parse(req.headers.cookie ?? '')
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]
  const raw = cookies[`sb-${projectRef}-auth-token`] ?? cookies['sb-access-token']
  let token: string | null = null
  try { token = raw ? JSON.parse(decodeURIComponent(raw)).access_token ?? raw : null } catch { token = raw ?? null }
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}
