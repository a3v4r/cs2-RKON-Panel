import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { queryInfo } from '@/server/a2s';
import { getLive, setMapName } from '@/server/live';
import { rconCommand } from '@/server/rcon';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Live match view: the current state from the game server (get5_status, A2S) plus what MatchZy events told us
// (player stats, rounds, kills). Events only arrive for matches started from the panel.
export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });

  const [info, status] = await Promise.all([
    queryInfo(server.host, server.port).catch(() => null),
    rconCommand(server.host, server.port, server.rcon_password, 'get5_status')
      .then((out) => JSON.parse(out.slice(out.indexOf('{'))))
      .catch(() => null),
  ]);
  if (info?.map) setMapName(server.id, info.map);

  const live = getLive(server.id);
  const sameMatch = live && status?.matchid != null && live.matchid === status.matchid;

  return NextResponse.json({
    online: !!info,
    map: info?.map ?? null,
    status: status && status.gamestate !== 'none'
      ? {
          state: status.gamestate,
          paused: !!status.paused,
          matchid: status.matchid,
          mapNumber: status.map_number,
          round: status.round_number,
          // Our MatchZy fork only: what the in-game timer shows (phase, seconds left)
          clock: status.round_clock ?? null,
          team1: status.team1 ? { name: status.team1.name, score: status.team1.current_map_score, series: status.team1.series_score, side: status.team1.side } : null,
          team2: status.team2 ? { name: status.team2.name, score: status.team2.current_map_score, series: status.team2.series_score, side: status.team2.side } : null,
        }
      : null,
    // Stats of the match currently on the server, or of the last finished one when nothing is loaded
    live: sameMatch || !status || status.gamestate === 'none' ? live : null,
  });
}
