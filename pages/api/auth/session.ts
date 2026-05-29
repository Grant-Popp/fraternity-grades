import type { NextApiRequest, NextApiResponse } from 'next'
import { serialize } from 'cookie'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const isProd = process.env.NODE_ENV === 'production'

  if (req.method === 'POST') {
    const { accessToken, expiresIn } = req.body
    if (!accessToken) return res.status(400).json({ error: 'Missing token' })
    res.setHeader('Set-Cookie', serialize('sb-access-token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: Math.min(expiresIn ?? 3600, 86400),
      path: '/',
    }))
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', serialize('sb-access-token', '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    }))
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}
