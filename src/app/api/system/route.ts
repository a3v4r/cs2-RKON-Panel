import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { startSystemSampler, systemInfo } from '@/server/system';

export const dynamic = 'force-dynamic';

// Load of the panel PC for the overview charts
export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  startSystemSampler(); // normally already running from instrumentation; harmless if so
  return NextResponse.json(systemInfo());
}
