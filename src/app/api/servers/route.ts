import { NextResponse } from 'next/server';
import { publicServer, servers } from '@/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(servers.list().map(publicServer));
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name || !body.host || !body.port) {
    return NextResponse.json({ error: 'Нужны имя, адрес и порт' }, { status: 400 });
  }
  const server = servers.add({
    name: String(body.name),
    host: String(body.host).trim(),
    port: Number(body.port),
    rcon_password: String(body.rcon_password ?? ''),
    country_code: body.country_code || undefined,
  });
  return NextResponse.json(publicServer(server));
}
