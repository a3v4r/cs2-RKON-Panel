import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { allStates, startInstanceWatcher } from '@/server/instances';
import { cs2Paths } from '@/server/panel-settings';

export const dynamic = 'force-dynamic';

// Process state of the servers the panel runs, and whether CS2 is found on this PC
export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  await startInstanceWatcher(); // normally already running from instrumentation
  const paths = cs2Paths();
  return NextResponse.json({ cs2Dir: paths.dir, cs2Found: fs.existsSync(paths.exe), states: allStates() });
}
