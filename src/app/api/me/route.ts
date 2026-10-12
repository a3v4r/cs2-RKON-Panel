import { NextResponse } from 'next/server';
import { ANY_ROLE, requireRole } from '@/server/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(ANY_ROLE);
  return user instanceof NextResponse ? user : NextResponse.json(user);
}
