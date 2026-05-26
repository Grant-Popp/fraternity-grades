import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/submit') || pathname.startsWith('/admin')
  const isAuthPage = pathname.startsWith('/auth/')

  // Read the Supabase auth token from cookies
  const token = req.cookies.get('sb-access-token')?.value ??
    req.cookies.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`)?.value

  // Simple check: if protected route and no token cookie, redirect to login
  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/auth/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/submit/:path*', '/admin/:path*', '/auth/:path*'],
}
