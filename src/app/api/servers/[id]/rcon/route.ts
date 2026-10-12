import { NextResponse } from 'next/server';
import { STAFF, audit, requireRole } from '@/server/auth';
import { rconCommand } from '@/server/rcon';
import { servers } from '@/server/store';

type Params = { params: Promise<{ id: string }> };

// Read-only polling commands are not worth an audit line
const QUIET_COMMANDS = new Set(['status', 'get5_status', 'hostname']);

export async function POST(req: Request, { params }: Params) {
  const user = await requireRole(STAFF);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  const { command } = await req.json();
  if (!command || typeof command !== 'string') {
    return NextResponse.json({ error: 'Пустая команда' }, { status: 400 });
  }
  if (!QUIET_COMMANDS.has(command.trim())) audit(user, `rcon #${server.id} ${server.name}: ${command}`);
  try {
    const output = await rconCommand(server.host, server.port, server.rcon_password, command);
    return NextResponse.json({ output });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
