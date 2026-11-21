import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { removeWorkshop } from '@/server/maps';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  removeWorkshop(id);
  audit(user, `workshop map remove #${id}`);
  return NextResponse.json({ ok: true });
}
