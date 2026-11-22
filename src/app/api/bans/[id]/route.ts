import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { unban } from '@/server/players';

type Params = { params: Promise<{ id: string }> };

// Unban
export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  try {
    const ban = unban(Number((await params).id));
    audit(user, `unban ${ban.name} ${ban.steamid}`);
    return NextResponse.json(ban);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
