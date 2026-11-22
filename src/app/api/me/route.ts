import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  return user instanceof NextResponse ? user : NextResponse.json(user);
}
