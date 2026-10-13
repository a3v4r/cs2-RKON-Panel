import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { publicServer, servers } from '@/server/store';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name);
  if (body.host !== undefined) update.host = String(body.host).trim();
  if (body.port !== undefined) update.port = Number(body.port);
  if (body.country_code !== undefined) update.country_code = body.country_code || undefined;
  // Empty password field in the form = keep the stored one
  if (body.rcon_password) update.rcon_password = String(body.rcon_password);
  const server = servers.update(id, update);
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  audit(user, `server edit #${id}`);
  return NextResponse.json(publicServer(server));
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  servers.remove(id);
  audit(user, `server delete #${id}`);
  return NextResponse.json({ ok: true });
}
