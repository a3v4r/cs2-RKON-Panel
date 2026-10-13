import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { commands } from '@/server/store';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const { label, command } = await req.json();
  commands.update(Number((await params).id), String(label), String(command));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  commands.remove(Number((await params).id));
  return NextResponse.json({ ok: true });
}
