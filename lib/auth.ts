import { createClient } from '@supabase/supabase-js'
import type { GetServerSidePropsContext } from 'next'
import { parse } from 'cookie'

function getServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getTokenFromCookies(ctx: GetServerSidePropsContext): string | null {
  const cookies = parse(ctx.req.headers.cookie ?? '')
  // Supabase stores the token in a cookie named after the project ref
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]
  const tokenKey = `sb-${projectRef}-auth-token`
  const raw = cookies[tokenKey] ?? cookies['sb-access-token']
  if (!raw) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    return parsed.access_token ?? parsed[0] ?? null
  } catch {
    return raw
  }
}

export async function requireAuth(ctx: GetServerSidePropsContext) {
  const supabase = getServerSupabase()
  const token = getTokenFromCookies(ctx)

  if (!token) {
    return { redirect: { destination: '/auth/login', permanent: false }, supabase, session: null, profile: null }
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return { redirect: { destination: '/auth/login', permanent: false }, supabase, session: null, profile: null }
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const session = { user }

  return { supabase, session, profile, redirect: null }
}

export async function requireAdmin(ctx: GetServerSidePropsContext) {
  const result = await requireAuth(ctx)
  if (result.redirect) return result
  if (result.profile?.role !== 'admin') {
    return { ...result, redirect: { destination: '/dashboard', permanent: false } }
  }
  return result
}
