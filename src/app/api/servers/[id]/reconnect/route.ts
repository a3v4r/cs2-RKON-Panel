import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { queryInfo } from '@/server/a2s';
import { closeRconSession } from '@/server/rcon';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Drops the pooled RCON socket and answers with a fresh A2S status, so the status
// pill and the next command both use a connection built from scratch.
export async function POST(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });

  closeRconSession(server.host, server.port, server.rcon_password);
  try {
    return NextResponse.json(await queryInfo(server.host, server.port));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
