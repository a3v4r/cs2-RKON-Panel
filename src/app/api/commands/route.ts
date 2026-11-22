import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { commands } from '@/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(commands.list());
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { label, command } = await req.json();
  if (!label || !command) return NextResponse.json({ error: 'Нужны название и команда' }, { status: 400 });
  return NextResponse.json(commands.add(String(label), String(command)));
}
