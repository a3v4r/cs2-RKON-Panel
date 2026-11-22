import { NextResponse } from 'next/server';
import { ADMIN_LOGIN, adminPassword } from '@/server/accounts';
import { audit, requireUser } from '@/server/auth';
import { createUser, listUsers, publicUser } from '@/server/users';

export const dynamic = 'force-dynamic';

// Personal accounts, plus the shared account admin (switched on when it has a password)
export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({
    users: listUsers().map(publicUser),
    shared: [{ username: ADMIN_LOGIN, enabled: !!adminPassword() }],
    me: user.name ?? null,
  });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  try {
    const created = createUser(String(body.username ?? ''), String(body.password ?? ''));
    audit(user, `user add ${created.username}`);
    return NextResponse.json(publicUser(created));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
