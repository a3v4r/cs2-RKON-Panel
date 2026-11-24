import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { applyEvent } from '@/server/live';
import { eventToken } from '@/server/session';

type Params = { params: Promise<{ serverId: string }> };

// MatchZy remote log for live stats. Auth by the per-server token in the match config
// (matchzy_remote_log_header_*), not a login.
export async function POST(req: Request, { params }: Params) {
  const serverId = Number((await params).serverId);
  const expected = Buffer.from(`Bearer ${eventToken(serverId)}`);
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: 'bad token' }, { status: 401 });
  }
  const event = await req.json().catch(() => null);
  if (event) applyEvent(serverId, event);
  return NextResponse.json({ ok: true });
}
