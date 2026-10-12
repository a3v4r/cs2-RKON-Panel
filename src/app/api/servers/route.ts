import { NextResponse } from 'next/server';
import { STAFF, audit, requireRole } from '@/server/auth';
import { publicServer, servers } from '@/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(STAFF);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(servers.list().map(publicServer));
}

export async function POST(req: Request) {
  const user = await requireRole(['admin']);
  if (user instanceof NextResponse) return user;
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
  audit(user, `server add #${server.id} ${server.name} ${server.host}:${server.port}`);
  return NextResponse.json(publicServer(server));
}
