import { NextResponse } from 'next/server';
import { JUDGE, requireRole } from '@/server/auth';
import { templates } from '@/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(templates.list());
}

export async function POST(req: Request) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const { name, message } = await req.json();
  const text = String(message ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Пустой текст шаблона' }, { status: 400 });
  const title = String(name ?? '').trim() || text.slice(0, 30);
  return NextResponse.json(templates.add(title.slice(0, 60), text.slice(0, 200)));
}
