import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { downloadSteamcmd, repairSystem, systemHealth } from '@/server/system-health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(systemHealth());
}

// { action: 'repair' } puts Metamod back into gameinfo.gi; { action: 'steamcmd' } downloads SteamCMD
export async function POST(req: Request) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const { action } = await req.json().catch(() => ({}));
  try {
    if (action === 'repair') repairSystem();
    else if (action === 'steamcmd') await downloadSteamcmd();
    else return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  audit(user, `system ${action}`);
  return NextResponse.json(systemHealth());
}
