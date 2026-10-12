import { NextResponse } from 'next/server';
import { STAFF, audit, requireRole } from '@/server/auth';
import { setMatchConfig } from '@/server/matches';
import { addressFor } from '@/server/network';
import { servers } from '@/server/store';

// Stores the config and returns the URL the game server downloads it from (/api/matches/config/<id>, public).
export async function POST(req: Request) {
  const user = await requireRole(STAFF);
  if (user instanceof NextResponse) return user;
  const { config, serverId } = await req.json();
  let parsed: { matchid?: unknown };
  try {
    parsed = JSON.parse(config);
  } catch {
    return NextResponse.json({ error: 'Конфиг матча - не JSON' }, { status: 400 });
  }
  const server = servers.get(Number(serverId));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });

  const id = String(parsed.matchid ?? 'current');
  setMatchConfig(id, config);
  audit(user, `match config ${id} for #${server.id} ${server.name}`);
  const host = await addressFor(server.host);
  const port = Number(process.env.PORT || 3000);
  return NextResponse.json({ id, url: `http://${host}:${port}/api/matches/config/${encodeURIComponent(id)}` });
}
