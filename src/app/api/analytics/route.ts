import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { analytics, isRange, startAnalytics } from '@/server/analytics';

export const dynamic = 'force-dynamic';

// ?range=24h (default), 7d, 30d
export async function GET(req: Request) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  startAnalytics(); // normally already running from instrumentation
  const range = new URL(req.url).searchParams.get('range') ?? '24h';
  return NextResponse.json(analytics(isRange(range) ? range : '24h'));
}
