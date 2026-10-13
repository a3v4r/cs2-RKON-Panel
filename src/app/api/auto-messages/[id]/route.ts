import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { resetAutoMessage } from '@/server/scheduler';
import { autoMessages } from '@/server/store';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const { enabled } = await req.json();
  autoMessages.setEnabled(id, !!enabled);
  resetAutoMessage(id);
  audit(user, `auto-message #${id} ${enabled ? 'on' : 'off'}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  autoMessages.remove(id);
  resetAutoMessage(id);
  audit(user, `auto-message delete #${id}`);
  return NextResponse.json({ ok: true });
}
