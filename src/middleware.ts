import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, resolveSession } from '@/server/session';

// Login required for everything except login itself and the match config URL MatchZy downloads.
// API routes also check the session (requireUser).
// MatchZy events and the CS2 chat log use per-server tokens (see /api/events, /api/logs).
const PUBLIC_PATHS = ['/login', '/api/login', '/api/matches/config/', '/api/events/', '/api/logs/'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))) {
    return NextResponse.next();
  }
  if (resolveSession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = '/login';
  login.search = '';
  return NextResponse.redirect(login);
}

export const config = {
  // node runtime: sessions checked against data files and PANEL_PASSWORD at run time
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
