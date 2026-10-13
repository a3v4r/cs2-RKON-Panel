import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { templates } from '@/server/store';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  templates.remove(Number((await params).id));
  return NextResponse.json({ ok: true });
}
