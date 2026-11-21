import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ingestLog } from '@/server/chat-log';
import { eventToken } from '@/server/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ serverId: string; token: string }> };

// CS2 log over HTTP (logaddress_add_http). The game server cannot log in and cannot send headers here,
// so the per-server token is part of the URL.
export async function POST(req: Request, { params }: Params) {
  const { serverId, token } = await params;
  const id = Number(serverId);
  const expected = Buffer.from(eventToken(id));
  const given = Buffer.from(token ?? '');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: 'bad token' }, { status: 401 });
  }
  ingestLog(id, await req.text().catch(() => ''));
  return new NextResponse(null, { status: 200 });
}
