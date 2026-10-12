import { NextResponse } from 'next/server';
import { STAFF, requireRole } from '@/server/auth';
import { commands } from '@/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(STAFF);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(commands.list());
}

export async function POST(req: Request) {
  const user = await requireRole(['admin']);
  if (user instanceof NextResponse) return user;
  const { label, command } = await req.json();
  if (!label || !command) return NextResponse.json({ error: 'Нужны название и команда' }, { status: 400 });
  return NextResponse.json(commands.add(String(label), String(command)));
}
