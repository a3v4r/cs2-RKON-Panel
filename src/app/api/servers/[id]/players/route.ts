import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { getLive } from '@/server/live';
import { attachTeamInfo, hasPlayerTable, parseStatus, type MatchStatusTeams } from '@/server/players';
import { rconCommand } from '@/server/rcon';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Player list for the dashboard card: "status" gives name, ping, loss, state and the time
// a player has been connected. On MatchZy servers get5_status adds the current sides, and
// the panel's own event state (live.ts) tells which players are on which team.
export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });

  // "status" is what the button waits for: it goes first, get5_status (sides only) queues behind it
  const playersCommand = rconCommand(server.host, server.port, server.rcon_password, 'status', { priority: 'high' });
  const matchStatus = server.mode !== 'vanilla'
    ? rconCommand(server.host, server.port, server.rcon_password, 'get5_status')
        .then((out) => JSON.parse(out.slice(out.indexOf('{'))) as MatchStatusTeams)
        .catch(() => null)
    : Promise.resolve(null);

  let output: string;
  let status: MatchStatusTeams | null;
  try {
    [output, status] = await Promise.all([playersCommand, matchStatus]);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const players = parseStatus(output);

  // An empty reply (or a changed output format) must not look like an empty server
  const warning = hasPlayerTable(output)
    ? null
    : output.trim()
      ? 'Сервер ответил, но список игроков не распознан.'
      : 'Сервер не вернул список игроков.';

  // The event state may still describe the previous match: keep its team labels only while
  // the server reports the same match (or does not report a match id at all).
  const live = getLive(server.id);
  const sameMatch = live && !live.finished
    && (status?.matchid == null || live.matchid == null || live.matchid === status.matchid);
  if (sameMatch) attachTeamInfo(players, live, status);

  return NextResponse.json({ players, warning, fetchedAt: Date.now() });
}
