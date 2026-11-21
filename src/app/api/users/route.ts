import { NextResponse } from 'next/server';
import { accountPassword } from '@/server/accounts';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { createUser, listUsers, publicUser } from '@/server/users';

export const dynamic = 'force-dynamic';

// Personal accounts, plus whether the shared kit accounts are switched on (they have a password)
export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({
    users: listUsers().map(publicUser),
    shared: [
      { username: 'judge', role: 'judge', enabled: !!accountPassword('judge') },
      { username: 'broadcast', role: 'broadcast', enabled: !!accountPassword('broadcast') },
    ],
    me: user.name ?? null,
  });
}

export async function POST(req: Request) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  try {
    const created = createUser(String(body.username ?? ''), String(body.password ?? ''), body.role);
    audit(user, `user add ${created.username} (${created.role})`);
    return NextResponse.json(publicUser(created));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
