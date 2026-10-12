import { NextResponse } from 'next/server';
import { rconCommand } from '@/server/rcon';
import { servers } from '@/server/store';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  const { command } = await req.json();
  if (!command || typeof command !== 'string') {
    return NextResponse.json({ error: 'Пустая команда' }, { status: 400 });
  }
  try {
    const output = await rconCommand(server.host, server.port, server.rcon_password, command);
    return NextResponse.json({ output });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
