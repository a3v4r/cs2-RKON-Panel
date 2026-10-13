import { NextResponse } from 'next/server';
import { JUDGE, readAudit, requireRole } from '@/server/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(readAudit(200));
}
