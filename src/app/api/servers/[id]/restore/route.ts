import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { rconCommand } from '@/server/rcon';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };
type Server = NonNullable<ReturnType<typeof servers.get>>;

// Round restore (MatchZy css_restore). MatchZy saves matchzy_<matchid>_<map>_roundNN.json at the start of each round,
// NN = rounds already played, so backup NN takes the game back to the start of round NN+1 with that round's score.

const rcon = (server: Server, command: string) => rconCommand(server.host, server.port, server.rcon_password, command);

async function getStatus(server: Server) {
  const out = await rcon(server, 'get5_status');
  return JSON.parse(out.slice(out.indexOf('{')));
}

// matchzy_listbackups line: "<path>\matchzy_<matchid>_<map>_round<NN>.json <yyyy-mm-dd hh:mm:ss> <team1> <team2> <map> <score1> <score2>"
const BACKUP_LINE = /matchzy_(\d+)_(\d+)_round(\d+)\.json\s+\d{4}-\d\d-\d\d (\d\d:\d\d):\d\d\s.*\s(\d+)\s+(\d+)\s*$/;

// MatchZy messages carry chat colour codes and its chat prefix
const cleanOutput = (out: string) =>
  out.split('\n').map((line) => line.replace(/[\x00-\x1f]/g, '').replace(/^\s*\[[^\]]*\]\s*/, '').trim()).filter(Boolean).join('\n');

export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  try {
    const status = await getStatus(server);
    if (!status.matchid || status.gamestate === 'none') return NextResponse.json({ live: false, backups: [] });
    const out = await rcon(server, `matchzy_listbackups ${status.matchid}`);
    // After a restore the backups of the abandoned rounds stay on disk until those rounds are played again
    const current = status.round_number >= 0 ? status.round_number : Infinity;
    const backups = out.split('\n')
      .map((line) => BACKUP_LINE.exec(line.trim()))
      .filter((m): m is RegExpExecArray => !!m && Number(m[2]) === status.map_number && Number(m[3]) <= current)
      .map((m) => ({ round: Number(m[3]), time: m[4], team1Score: Number(m[5]), team2Score: Number(m[6]) }))
      .sort((a, b) => a.round - b.round);
    return NextResponse.json({ live: status.gamestate === 'live', backups });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  const { round } = await req.json().catch(() => ({}));
  if (!Number.isInteger(round) || round < 0 || round > 99) {
    return NextResponse.json({ error: 'Неверный номер раунда' }, { status: 400 });
  }
  try {
    // MatchZy ignores css_restore silently when the match is not live
    const status = await getStatus(server);
    if (status.gamestate !== 'live') {
      return NextResponse.json({ error: 'Откат возможен только во время игры (не в разминке и не после конца карты)' }, { status: 409 });
    }
    audit(user, `откат #${server.id} ${server.name}: к началу раунда ${round + 1} (css_restore ${round})`);
    // On success MatchZy answers in chat a moment later; anything in the console reply is a refusal
    const output = cleanOutput(await rcon(server, `css_restore ${round}`));
    if (output) return NextResponse.json({ error: output }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
