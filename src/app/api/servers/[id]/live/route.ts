import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { queryInfo, queryPlayers } from '@/server/a2s';
import { getGameLog, noteGameLogHalfLength, noteGameLogMap } from '@/server/game-log';
import { getLive, setMapName } from '@/server/live';
import { getObservation, observeMatch } from '@/server/live-observer';
import { rconCommand } from '@/server/rcon';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Live match view: everything the game server can tell us, refreshed on every poll.
//  - get5_status over RCON: state, round, clock, scores, sides, maps, connected/ready players
//  - A2S: map name and whether the server answers at all
//  - MatchZy events (live.ts): player stats, kills, round reasons - only for matches launched from the panel
//  - Poll observations (live-observer.ts): rounds and map results for matches started outside the panel
//  - Game log + A2S players (game-log.ts): score, rounds and kills of a match that MatchZy does not run
export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });

  // A vanilla server has no get5_status, but mp_maxrounds tells the log parser how long a half
  // is (24 -> MR12, 30 -> MR15); otherwise the score would swap sides at the wrong round.
  const vanilla = server.mode === 'vanilla';
  // On a vanilla server the A2S player list is part of the normal view: ask for it in parallel
  // with the other queries. On a MatchZy server it is only needed while get5_status reports no
  // match, so the serial query below is skipped on every poll of a live MatchZy match.
  const vanillaPlayers = vanilla
    ? queryPlayers(server.host, server.port).catch(() => null)
    : Promise.resolve(null);
  const [info, status, maxRoundsReply, a2sPlayers] = await Promise.all([
    queryInfo(server.host, server.port).catch(() => null),
    rconCommand(server.host, server.port, server.rcon_password, 'get5_status')
      .then((out) => JSON.parse(out.slice(out.indexOf('{'))))
      .catch(() => null),
    vanilla
      ? rconCommand(server.host, server.port, server.rcon_password, 'mp_maxrounds').catch(() => null)
      : Promise.resolve(null),
    vanillaPlayers,
  ]);
  const applyHalfLength = (reply: string | null) => {
    if (!reply) return;
    const maxRounds = Number(/=\s*"?(\d+)"?/.exec(reply)?.[1]);
    if (Number.isFinite(maxRounds) && maxRounds >= 2) {
      noteGameLogHalfLength(server.id, Math.max(1, Math.floor(maxRounds / 2)));
    }
  };
  // mp_maxrounds does not depend on A2S: apply the vanilla reply even if A2S info failed
  if (vanilla) applyHalfLength(maxRoundsReply);
  if (info?.map) {
    setMapName(server.id, info.map);
    // The log knows the score; A2S knows the map even before the log prints a new Match_Start
    noteGameLogMap(server.id, info.map);
  }

  // Learn the rounds played since the last poll (works for any match MatchZy runs)
  const observed = status && status.gamestate !== 'none'
    ? observeMatch(server.id, status, info?.map ?? null)
    : getObservation(server.id);

  const live = getLive(server.id);
  const sameMatch = live && status?.matchid != null && live.matchid === status.matchid;
  // The observation keeps the last match seen: do not show it when a different match is loaded now
  const sameObservation = observed && (status?.matchid == null || observed.matchid == null || observed.matchid === status.matchid);

  const team = (t: typeof status.team1) => t
    ? {
        name: t.name,
        score: t.current_map_score,
        series: t.series_score,
        side: t.side,
        connected: t.connected_clients ?? null,
        ready: !!t.ready,
      }
    : null;

  const mapScore = (t: typeof status.team1) => (typeof t?.current_map_score === 'number' ? t.current_map_score : 0);
  // Stock MatchZy reports round_number only while live; the sum of map scores is the same value there
  const round = status?.gamestate === 'live'
    ? (typeof status.round_number === 'number' ? status.round_number : mapScore(status.team1) + mapScore(status.team2))
    : -1;

  // A2S player names and mp_maxrounds are only needed by the fallback view: when MatchZy
  // reports a loaded match, its status already has everything (and asking twice is wasteful).
  // On a vanilla server they were requested in parallel above; on a MatchZy server without a
  // loaded match (a manual match) they are requested here.
  const needsFallback = (!status || status.gamestate === 'none') && !!info;
  const fallback = needsFallback
    ? vanilla
      ? { players: a2sPlayers, maxRounds: maxRoundsReply }
      : await Promise.all([
          queryPlayers(server.host, server.port).catch(() => null),
          rconCommand(server.host, server.port, server.rcon_password, 'mp_maxrounds').catch(() => null),
        ]).then(([players, maxRounds]) => ({ players, maxRounds }))
    : null;
  const players = fallback?.players ?? null;
  // On a MatchZy server the half length is only read when the fallback itself is active
  if (!vanilla) applyHalfLength(fallback?.maxRounds ?? null);
  const log = getGameLog(server.id);
  // The state keeps team scores; the fallback view labels them by the sides the teams are on now
  const ctScore = log ? (log.ctTeam === 'team1' ? log.score1 : log.score2) : 0;
  const tScore = log ? (log.ctTeam === 'team1' ? log.score2 : log.score1) : 0;
  const logAt = log ? Date.parse(log.updatedAt) : NaN;
  const logAgeSeconds = Number.isFinite(logAt) ? Math.max(0, Math.round((Date.now() - logAt) / 1000)) : null;
  const generic = log || players
    ? {
        map: log?.map ?? info?.map ?? null,
        ctScore,
        tScore,
        halfLength: log?.halfLength ?? 12,
        rounds: log?.rounds ?? [],
        kills: log?.kills ?? [],
        phase: log?.phase ?? 'idle',
        updatedAt: log?.updatedAt ?? new Date().toISOString(),
        logAgeSeconds,
        players,
      }
    : null;

  return NextResponse.json({
    online: !!info || !!status,
    map: info?.map ?? null,
    status: status && status.gamestate !== 'none'
      ? {
          state: status.gamestate,
          paused: !!status.paused,
          matchid: status.matchid,
          mapNumber: status.map_number,
          numMaps: Array.isArray(status.maps) ? status.maps.length : live?.numMaps ?? null,
          maps: Array.isArray(status.maps) ? status.maps : null,
          round,
          // Our MatchZy fork only: what the in-game timer shows (phase, seconds left)
          clock: status.round_clock ?? null,
          team1: team(status.team1),
          team2: team(status.team2),
        }
      : null,
    // Stats of the match currently on the server, or of the last finished one when nothing is loaded
    live: sameMatch || !status || status.gamestate === 'none' ? live : null,
    observed: sameObservation ? observed : null,
    generic,
  });
}
