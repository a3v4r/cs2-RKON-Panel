import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { cs2Dir, cs2Paths, writeSettings } from '@/server/panel-settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ cs2Dir: cs2Dir(), cs2Found: fs.existsSync(cs2Paths().exe) });
}

export async function PUT(req: Request) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const dir = String(body.cs2Dir ?? '').trim();
  if (!dir) return NextResponse.json({ error: 'Укажите папку' }, { status: 400 });
  writeSettings({ cs2Dir: dir });
  audit(user, `settings cs2Dir ${dir}`);
  return NextResponse.json({ cs2Dir: dir, cs2Found: fs.existsSync(cs2Paths(dir).exe) });
}
