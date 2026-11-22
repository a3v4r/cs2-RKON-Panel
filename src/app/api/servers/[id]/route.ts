import { NextResponse } from 'next/server';
import { forgetServer } from '@/server/forget-server';
import { audit, requireUser } from '@/server/auth';
import { isRunning } from '@/server/instances';
import { managedHost, parseManaged } from '@/server/managed';
import { publicServer, servers } from '@/server/store';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const current = servers.get(id);
  if (!current) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name);
  // A server started by the panel always lives on this PC
  if (body.host !== undefined && !current.managed) update.host = String(body.host).trim();
  if (body.port !== undefined) update.port = Number(body.port);
  if (body.mode !== undefined) update.mode = body.mode === 'vanilla' ? 'vanilla' : undefined;
  if (body.country_code !== undefined) update.country_code = body.country_code || undefined;
  // Empty password field in the form = keep the stored one
  if (body.rcon_password) update.rcon_password = String(body.rcon_password);
  if (current.managed && body.managed) {
    try {
      const managed = parseManaged(body.managed, Number(update.port ?? current.port), id);
      update.managed = managed;
      update.host = managedHost(managed);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  const server = servers.update(id, update);
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  audit(user, `server edit #${id}`);
  return NextResponse.json(publicServer(server));
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  if (isRunning(id)) return NextResponse.json({ error: 'Сервер запущен: сначала остановите его' }, { status: 409 });
  servers.remove(id);
  forgetServer(id);
  audit(user, `server delete #${id}`);
  return NextResponse.json({ ok: true });
}
