import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { addWorkshop, listWorkshop } from '@/server/maps';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(listWorkshop());
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  try {
    const item = await addWorkshop(String(body.workshop_id ?? ''), body.map_file ? String(body.map_file) : undefined);
    audit(user, `workshop map add ${item.workshop_id} ${item.name}`);
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
