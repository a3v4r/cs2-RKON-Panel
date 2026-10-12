import { NextResponse } from 'next/server';
import { ANY_ROLE, requireRole } from '@/server/auth';
import { queryInfo } from '@/server/a2s';
import { lanAddresses } from '@/server/network';
import { pauses } from '@/server/pauses';
import { rconCommand } from '@/server/rcon';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

// GOTV port rarely changes: ask the server once
const tvPorts = new Map<number, number>();

interface TeamState {
  name: string;
  series_score: number;
  current_map_score: number;
  side: string;
}

// Everything the broadcast team needs per server: connect strings (game + GOTV), map, score and match state.
export async function GET(req: Request) {
  const user = await requireRole(ANY_ROLE);
  if (user instanceof NextResponse) return user;

  // Servers on this PC are listed as 127.0.0.1; give viewers the address they reached the panel by instead
  const viewerHost = (req.headers.get('host') ?? 'localhost').replace(/:\d+$/, '');
  const own = lanAddresses();

  const result = await Promise.all(servers.list().map(async (s) => {
    const local = s.host === 'localhost' || s.host.startsWith('127.') || own.includes(s.host);
    const host = local ? (viewerHost === 'localhost' ? '127.0.0.1' : viewerHost) : s.host;

    const [info, status, tvPort] = await Promise.all([
      queryInfo(s.host, s.port).catch(() => null),
      rconCommand(s.host, s.port, s.rcon_password, 'get5_status')
        .then((out) => JSON.parse(out.slice(out.indexOf('{'))))
        .catch(() => null),
      tvPorts.has(s.id)
        ? Promise.resolve(tvPorts.get(s.id))
        : rconCommand(s.host, s.port, s.rcon_password, 'tv_port')
            .then((out) => {
              const port = Number(/=\s*(\d+)/.exec(out)?.[1]);
              if (port) tvPorts.set(s.id, port);
              return port || undefined;
            })
            .catch(() => undefined),
    ]);

    // Someone else lifted our pause (or the match ended): forget it
    if (!status?.paused) pauses.clear(s.id);

    const team = (t: TeamState | null | undefined) =>
      t ? { name: t.name, series: t.series_score, score: t.current_map_score, side: t.side } : null;

    return {
      id: s.id,
      name: s.name,
      online: !!info,
      map: info?.map ?? null,
      hostname: info?.name ?? null,
      players: info ? Math.max(0, info.players - info.bots) : 0,
      connect: `connect ${host}:${s.port}`,
      gotv: tvPort ? `connect ${host}:${tvPort}` : null,
      match: status && status.gamestate && status.gamestate !== 'none'
        ? {
            state: status.gamestate as string,
            paused: !!status.paused,
            pausedByBroadcast: !!status.paused && pauses.isBroadcast(s.id),
            mapNumber: status.map_number as number,
            round: status.round_number as number,
            team1: team(status.team1),
            team2: team(status.team2),
          }
        : null,
    };
  }));

  return NextResponse.json(result);
}
