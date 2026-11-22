import { NextResponse } from 'next/server';
import { readAudit, requireUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(readAudit(200));
}
