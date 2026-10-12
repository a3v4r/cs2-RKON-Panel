import { NextResponse } from 'next/server';
import { audit, requireRole } from '@/server/auth';
import { ROLES, Role, users } from '@/server/users';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const user = await requireRole(['admin']);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const { password, role } = await req.json();
  if (role !== undefined && !ROLES.includes(role)) return NextResponse.json({ error: 'Неизвестная роль' }, { status: 400 });
  if (password !== undefined && String(password).length < 4) {
    return NextResponse.json({ error: 'Пароль: минимум 4 символа' }, { status: 400 });
  }
  users.update(id, { password: password ? String(password) : undefined, role: role as Role | undefined });
  audit(user, `user edit #${id}${role ? ` role=${role}` : ''}${password ? ' password' : ''}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireRole(['admin']);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  users.remove(id);
  audit(user, `user delete #${id}`);
  return NextResponse.json({ ok: true });
}
