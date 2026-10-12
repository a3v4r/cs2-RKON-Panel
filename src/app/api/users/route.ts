import { NextResponse } from 'next/server';
import { audit, requireRole } from '@/server/auth';
import { ROLES, Role, users } from '@/server/users';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(['admin']);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(users.list());
}

export async function POST(req: Request) {
  const user = await requireRole(['admin']);
  if (user instanceof NextResponse) return user;
  const { username, password, role } = await req.json();
  const name = String(username ?? '').trim();
  if (!/^[\w.-]{2,32}$/.test(name)) {
    return NextResponse.json({ error: 'Логин: 2-32 символа, латиница, цифры, точка, дефис, подчёркивание' }, { status: 400 });
  }
  if (!password || String(password).length < 4) {
    return NextResponse.json({ error: 'Пароль: минимум 4 символа' }, { status: 400 });
  }
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Неизвестная роль' }, { status: 400 });
  try {
    const created = users.add(name, String(password), role as Role);
    audit(user, `user add ${created.username} (${created.role})`);
    return NextResponse.json({ id: created.id, username: created.username, role: created.role });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
