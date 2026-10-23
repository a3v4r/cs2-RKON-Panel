import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { rconCommand } from '@/server/rcon';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };
type Server = NonNullable<ReturnType<typeof servers.get>>;

// Round restore on a vanilla CS2 server (no MatchZy): the game keeps its own round backups.
// mp_backup_restore_list_files prints them newest first; mp_backup_restore_load_file restores
// the score, money and stats saved in the chosen file and (with autopause) pauses the match.

const rcon = (server: Server, command: string) =>
  rconCommand(server.host, server.port, server.rcon_password, command, { priority: 'high' });

const FILE_NAME = /^[A-Za-z0-9_.-]+\.txt$/;

// Default backups are backup_roundNN.txt; a custom mp_backup_round_file prefix adds
// date, teams, map and score around "..._roundNN_<score1>_<score2>.txt".
function parseRound(file: string): number | null {
  const direct = /_round(\d+)\.txt$/i.exec(file);
  if (direct) return Number(direct[1]);
  const decorated = /_round(\d+)(?:_\d+)*\.txt$/i.exec(file);
  return decorated ? Number(decorated[1]) : null;
}

export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  try {
    const output = await rcon(server, 'mp_backup_restore_list_files 20');
    const files = [...new Set(output.match(/[A-Za-z0-9_.-]+\.txt/g) ?? [])]
      .map((file) => ({ file, round: parseRound(file) }))
      .sort((a, b) => (b.round ?? -1) - (a.round ?? -1));
    return NextResponse.json({ files });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  const { file } = await req.json().catch(() => ({}));
  if (typeof file !== 'string' || !FILE_NAME.test(file)) {
    return NextResponse.json({ error: 'Неверный файл резервной копии' }, { status: 400 });
  }
  try {
    audit(user, `откат #${server.id} ${server.name}: ${file} (mp_backup_restore_load_file)`);
    // Autopause is on by default, but an admin may have turned it off: round restores pause the match.
    await rcon(server, 'mp_backup_restore_load_autopause 1');
    const output = await rcon(server, `mp_backup_restore_load_file ${file}`);
    const clean = output.split('\n').map((line) => line.replace(/[\x00-\x1f]/g, '').trim()).filter(Boolean).join('\n');
    if (/couldn'?t|cannot|not found|invalid|failed/i.test(clean)) {
      return NextResponse.json({ error: clean }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
