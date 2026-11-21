import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { livePlayers } from '@/server/players';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Players on the server now (RCON "status", SteamIDs from the server log)
export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  try {
    return NextResponse.json(await livePlayers(server));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
