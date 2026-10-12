import { NextResponse } from 'next/server';
import { SESSION_COOKIE, panelPassword, sessionToken } from '@/server/session';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  const expected = panelPassword();
  if (expected && password !== expected) {
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(expected), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
