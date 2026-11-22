import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { readSettings, writeSettings } from '@/server/panel-settings';
import { restartSkinsSite, skinsSiteView, syncSkinsSite } from '@/server/skins-site';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(skinsSiteView());
}

// { enabled?, port? } | { action: 'restart' }
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  if (body.action === 'restart') {
    await restartSkinsSite();
    audit(user, 'skins site restart');
    return NextResponse.json(skinsSiteView());
  }
  const update = { ...readSettings().skinsSite };
  if (body.enabled !== undefined) update.enabled = Boolean(body.enabled);
  if (body.port !== undefined) {
    const port = Number(body.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return NextResponse.json({ error: 'Порт: число от 1 до 65535' }, { status: 400 });
    update.port = port;
  }
  writeSettings({ skinsSite: update });
  audit(user, `skins site ${Object.keys(body).join(', ')}`);
  await syncSkinsSite();
  return NextResponse.json(skinsSiteView());
}
