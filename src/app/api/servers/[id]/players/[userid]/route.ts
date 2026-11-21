import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { addBan, kick } from '@/server/players';
import { servers } from '@/server/store';

type Params = { params: Promise<{ id: string; userid: string }> };

// { action: 'kick', reason } or { action: 'ban', reason, minutes, steamid, name }
export async function POST(req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const { id, userid } = await params;
  const server = servers.get(Number(id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const uid = Number(userid);
  const reason = String(body.reason ?? '').trim();
  try {
    if (body.action === 'ban') {
      const minutes = Math.max(0, Math.floor(Number(body.minutes) || 0));
      const ban = addBan({ steamid: String(body.steamid ?? ''), name: String(body.name ?? ''), reason, minutes, by: user.name ?? (user.role === 'judge' ? 'judge' : 'broadcast') });
      await kick(server, uid, `Banned: ${reason || 'by referee'}`).catch(() => {});
      audit(user, `ban #${server.id} ${ban.name} ${ban.steamid} ${minutes ? `${minutes} min` : 'permanent'}${reason ? `: ${reason}` : ''}`);
      return NextResponse.json(ban);
    }
    if (body.action === 'kick') {
      await kick(server, uid, reason);
      audit(user, `kick #${server.id} ${String(body.name ?? uid)}${reason ? `: ${reason}` : ''}`);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
