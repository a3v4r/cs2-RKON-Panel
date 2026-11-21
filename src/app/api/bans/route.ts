import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { isActive, listBans } from '@/server/players';

export const dynamic = 'force-dynamic';

// The panel's ban list (all servers), newest first, with whether each ban still holds
export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(listBans().reverse().map((b) => ({ ...b, active: isActive(b) })));
}
