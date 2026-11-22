import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { applyPlugins, checkUpdates, isPluginId, pluginsView, removePlugin, rollbackPlugin, updatePlugin } from '@/server/plugins';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(pluginsView());
}

// { action: 'apply', enabled: { matchzy: true, ... } } | { action: 'check' } | { action: 'update' | 'rollback' | 'remove', id }
export async function POST(req: Request) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const { action, id } = body;
  try {
    if (action === 'check') await checkUpdates();
    else if (action === 'apply') {
      const enabled = Object.fromEntries(Object.entries(body.enabled ?? {}).filter(([k]) => isPluginId(k)).map(([k, v]) => [k, Boolean(v)]));
      await applyPlugins(enabled);
    } else if (action === 'update' || action === 'rollback' || action === 'remove') {
      if (!isPluginId(id)) return NextResponse.json({ error: 'Неизвестный плагин' }, { status: 400 });
      await (action === 'update' ? updatePlugin : action === 'rollback' ? rollbackPlugin : removePlugin)(id);
    } else return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
  if (action !== 'check') audit(user, `plugins ${action}${id ? ` ${id}` : ''}`);
  return NextResponse.json(pluginsView());
}
