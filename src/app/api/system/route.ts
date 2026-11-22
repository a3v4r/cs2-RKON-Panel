import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { startSystemSampler, systemInfo } from '@/server/system';

export const dynamic = 'force-dynamic';

// Load of the panel PC for the overview charts
export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  startSystemSampler(); // normally already running from instrumentation; harmless if so
  return NextResponse.json(systemInfo());
}
