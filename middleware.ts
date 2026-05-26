import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = req.nextUrl
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/submit') || pathname.startsWith('/admin')
  const isAuthPage = pathname.startsWith('/auth/')

  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/auth/login', req.url))
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/submit/:path*', '/admin/:path*', '/auth/:path*'],
}
