import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { readSchedule, writeSchedule } from '@/server/backups';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(readSchedule());
}

export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const frequency = ['daily', 'weekly', 'monthly'].includes(body.frequency) ? body.frequency : 'daily';
  const time = /^\d{2}:\d{2}$/.test(String(body.time)) ? String(body.time) : '04:00';
  const keep = Math.min(100, Math.max(1, Number(body.keep) || 7));
  const schedule = { enabled: !!body.enabled, frequency, time, keep };
  writeSchedule(schedule);
  audit(user, `backup schedule ${schedule.enabled ? `${frequency} ${time} keep ${keep}` : 'off'}`);
  return NextResponse.json(schedule);
}
