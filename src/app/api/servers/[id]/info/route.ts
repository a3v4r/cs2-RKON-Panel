import { NextResponse } from 'next/server';
import { STAFF, requireRole } from '@/server/auth';
import { queryInfo } from '@/server/a2s';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(STAFF);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  try {
    return NextResponse.json(await queryInfo(server.host, server.port));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
