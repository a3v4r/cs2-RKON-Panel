import { NextResponse } from 'next/server';
import { ANY_ROLE, audit, requireRole } from '@/server/auth';
import { RequestType, requests } from '@/server/requests';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(ANY_ROLE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(requests.list());
}

// The broadcast team asks the judges to pause or to continue a match.
export async function POST(req: Request) {
  const user = await requireRole(['broadcast']);
  if (user instanceof NextResponse) return user;
  const { serverId, type, reason } = await req.json();
  if (type !== 'pause' && type !== 'unpause') {
    return NextResponse.json({ error: 'Неизвестный запрос' }, { status: 400 });
  }
  const server = servers.get(Number(serverId));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  if (requests.pendingFor(server.id)) {
    return NextResponse.json({ error: 'Предыдущий запрос ещё ждёт ответа судьи' }, { status: 409 });
  }
  const text = String(reason ?? '').trim().slice(0, 200);
  const request = requests.create(server.id, server.name, type as RequestType, text);
  audit(user, `request ${type} #${server.id} ${server.name}${text ? `: ${text}` : ''}`);
  return NextResponse.json(request);
}
