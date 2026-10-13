import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { autoMessages, servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(autoMessages.forServer(Number((await params).id)));
}

export async function POST(req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  const { message, intervalMinutes } = await req.json();
  const text = String(message ?? '').trim().slice(0, 200);
  const minutes = Math.round(Number(intervalMinutes));
  if (!text) return NextResponse.json({ error: 'Пустое сообщение' }, { status: 400 });
  if (!(minutes >= 1 && minutes <= 240)) return NextResponse.json({ error: 'Интервал: от 1 до 240 минут' }, { status: 400 });
  const created = autoMessages.add(server.id, text, minutes);
  audit(user, `auto-message add #${created.id} on ${server.name} every ${minutes} min: ${text}`);
  return NextResponse.json(created);
}
