import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { deleteUser, listUsers, publicUser, updateUser } from '@/server/users';

type Params = { params: Promise<{ id: string }> };

// Change the password; that ends the user's current sessions
export async function PUT(req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const body = await req.json().catch(() => ({}));
  try {
    const updated = updateUser(id, { password: body.password ? String(body.password) : undefined });
    audit(user, `user edit ${updated.username}${body.password ? ' password' : ''}`);
    return NextResponse.json(publicUser(updated));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const target = listUsers().find((u) => u.id === id);
  if (!target) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
  if (target.username === user.name) return NextResponse.json({ error: 'Нельзя удалить самого себя' }, { status: 400 });
  deleteUser(id);
  audit(user, `user delete ${target.username}`);
  return NextResponse.json({ ok: true });
}
