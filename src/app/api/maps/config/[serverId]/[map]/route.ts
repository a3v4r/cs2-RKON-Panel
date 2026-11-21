import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { readMapCfg, writeMapCfg } from '@/server/maps';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ serverId: string; map: string }> };

// Config of one map on one server; the panel sends it over RCON after the map has loaded
export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const { serverId, map } = await params;
  try {
    return NextResponse.json({ content: readMapCfg(Number(serverId), map) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const { serverId, map } = await params;
  const { content } = await req.json().catch(() => ({}));
  try {
    writeMapCfg(Number(serverId), map, String(content ?? ''));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  audit(user, `map config #${serverId} ${map}`);
  return NextResponse.json({ ok: true });
}
