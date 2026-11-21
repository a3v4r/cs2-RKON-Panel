import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { cancelUpdate, startUpdate, updateState } from '@/server/cs2-update';
import { cs2Paths } from '@/server/panel-settings';

export const dynamic = 'force-dynamic';

function info() {
  const paths = cs2Paths();
  return { ...updateState(), cs2Dir: paths.dir, steamcmd: paths.steamcmd, steamcmdFound: fs.existsSync(paths.steamcmd) };
}

export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(info());
}

// Start or cancel the CS2 update through steamcmd
export async function POST(req: Request) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const { action } = await req.json().catch(() => ({}));
  try {
    if (action === 'start') await startUpdate();
    else if (action === 'cancel') cancelUpdate();
    else return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
  audit(user, `cs2 update ${action}`);
  return NextResponse.json(info());
}
