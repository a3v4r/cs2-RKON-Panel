import { NextResponse } from 'next/server';
import { SESSION_COOKIE, login } from '@/server/session';

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  const token = login(String(username ?? ''), String(password ?? ''));
  if (!token) return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
