import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { teams } from '@/server/store';
import { cleanTeam } from '@/lib/team-rules';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const team = cleanTeam(await req.json().catch(() => null));
  if (typeof team === 'string') return NextResponse.json({ error: team }, { status: 400 });
  const saved = teams.update(id, team);
  if (!saved) return NextResponse.json({ error: 'Команда не найдена' }, { status: 404 });
  audit(user, `team edit #${id} ${saved.name}`);
  return NextResponse.json(saved);
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const team = teams.get(id);
  teams.remove(id);
  audit(user, `team delete #${id}${team ? ` ${team.name}` : ''}`);
  return NextResponse.json({ ok: true });
}
