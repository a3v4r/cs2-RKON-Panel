import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { isActive, listBans } from '@/server/players';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(listBans().reverse().map((b) => ({ ...b, active: isActive(b) })));
}
