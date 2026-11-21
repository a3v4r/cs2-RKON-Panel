import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { changeMap } from '@/server/maps';
import { servers } from '@/server/store';

type Params = { params: Promise<{ id: string }> };

// Change the map (stock or workshop); the map's config is applied once it has loaded
export async function POST(req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  const { map, workshopId } = await req.json().catch(() => ({}));
  if (!map) return NextResponse.json({ error: 'Не указана карта' }, { status: 400 });
  try {
    const output = await changeMap(server, { map: String(map), workshopId: workshopId ? String(workshopId) : undefined });
    audit(user, `map #${server.id} ${server.name}: ${workshopId ? `workshop ${workshopId}` : map}`);
    return NextResponse.json({ output });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
