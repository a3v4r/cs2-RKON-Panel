import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { teams } from '@/server/store';
import { cleanTeam } from '@/lib/team-rules';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(teams.list());
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const team = cleanTeam(await req.json().catch(() => null));
  if (typeof team === 'string') return NextResponse.json({ error: team }, { status: 400 });
  const saved = teams.add(team);
  audit(user, `team add #${saved.id} ${saved.name}`);
  return NextResponse.json(saved);
}
