import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'
import type { GetServerSidePropsContext } from 'next'

export async function requireAuth(ctx: GetServerSidePropsContext) {
  const supabase = createPagesServerClient(ctx)
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return { redirect: { destination: '/auth/login', permanent: false }, supabase, session: null, profile: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

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
