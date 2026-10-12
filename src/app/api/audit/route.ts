import { NextResponse } from 'next/server';
import { readAudit, requireRole } from '@/server/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(['admin']);
  if (user instanceof NextResponse) return user;
  const entries = readAudit(200).map((line) => {
    const [time, username, role, ...action] = line.split('\t');
    return { time, username, role, action: action.join('\t') };
  });
  return NextResponse.json(entries);
}
