import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { teams } from '@/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(teams.list());
}

// The whole list is saved at once: the editor is a textarea, one team per line
export async function PUT(req: Request) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const { teams: names } = await req.json().catch(() => ({}));
  if (!Array.isArray(names)) return NextResponse.json({ error: 'Нужен список команд' }, { status: 400 });
  return NextResponse.json(teams.replace(names));
}
