import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { setMatchConfig } from '@/server/matches';
import { addressFor } from '@/server/network';
import { eventToken } from '@/server/session';
import { servers } from '@/server/store';

// returns the public URL the game server downloads it from (/api/matches/config/<id>)
export async function POST(req: Request) {
  const user = await requireUser();
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
  const host = await addressFor(server.host);
  const port = Number(process.env.PORT || 3000);

  // MatchZy posts events (scores, player stats) back for the live tab
  const withEvents = {
    ...parsed,
    cvars: {
      ...((parsed as { cvars?: Record<string, string> }).cvars ?? {}),
      matchzy_remote_log_url: `http://${host}:${port}/api/events/${server.id}`,
      matchzy_remote_log_header_key: 'Authorization',
      matchzy_remote_log_header_value: `Bearer ${eventToken(server.id)}`,
    },
  };
  setMatchConfig(id, JSON.stringify(withEvents));
  audit(user, `match config ${id} for #${server.id} ${server.name}`);
  return NextResponse.json({ id, url: `http://${host}:${port}/api/matches/config/${encodeURIComponent(id)}` });
}
