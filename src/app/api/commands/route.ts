import { NextResponse } from 'next/server';
import { commands } from '@/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(commands.list());
}

export async function POST(req: Request) {
  const { label, command } = await req.json();
  if (!label || !command) return NextResponse.json({ error: 'Нужны название и команда' }, { status: 400 });
  return NextResponse.json(commands.add(String(label), String(command)));
}
