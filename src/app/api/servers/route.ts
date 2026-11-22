import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { generatePassword, managedHost, parseManaged } from '@/server/managed';
import { publicServer, servers } from '@/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(servers.list().map(publicServer));
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json();

  // A server the panel creates and starts on this PC
  if (body.managed) {
    if (!body.name) return NextResponse.json({ error: 'Нужно название' }, { status: 400 });
    const port = Number(body.port);
    let managed;
    try {
      managed = parseManaged(body.managed, port);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    const server = servers.add({
      name: String(body.name),
      host: managedHost(managed),
      port,
      rcon_password: String(body.rcon_password || generatePassword()),
      country_code: body.country_code || undefined,
      managed,
    });
    audit(user, `server create #${server.id} ${server.name} port ${port} tv ${managed.tvPort}`);
    return NextResponse.json(publicServer(server));
  }

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
