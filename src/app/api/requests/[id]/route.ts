import { NextResponse } from 'next/server';
import { ANY_ROLE, audit, requireRole } from '@/server/auth';
import { rconCommand } from '@/server/rcon';
import { requests } from '@/server/requests';
import { servers } from '@/server/store';

type Params = { params: Promise<{ id: string }> };

// Judges accept or reject a request (accepting runs the pause/unpause); the broadcast team may cancel its own.
export async function POST(req: Request, { params }: Params) {
  const user = await requireRole(ANY_ROLE);
  if (user instanceof NextResponse) return user;
  const request = requests.get(Number((await params).id));
  if (!request) return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 });
  if (request.status !== 'pending') return NextResponse.json({ error: 'На запрос уже ответили' }, { status: 409 });

  const { decision } = await req.json();
  const allowed = user.role === 'judge' ? ['accept', 'reject'] : ['cancel'];
  if (!allowed.includes(decision)) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });

  if (decision === 'accept') {
    const server = servers.get(request.serverId);
    if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
    const commands = request.type === 'pause'
      ? [server.mode === 'vanilla' ? 'mp_pause_match' : 'css_forcepause', `say Пауза по запросу трансляции${request.reason ? `: ${request.reason}` : ''}`]
      : ['say Трансляция готова, матч продолжается', server.mode === 'vanilla' ? 'mp_unpause_match' : 'css_forceunpause'];
    try {
      // say/css_forcepause take RCON's fast path (no reply), so the judge gets an answer quickly
      for (const command of commands) await rconCommand(server.host, server.port, server.rcon_password, command, { priority: 'high' });
    } catch (e) {
      // stays pending: the judge can retry or reject
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  const status = decision === 'accept' ? 'accepted' : decision === 'reject' ? 'rejected' : 'cancelled';
  requests.resolve(request.id, status);
  audit(user, `request #${request.id} ${request.type} ${request.serverName}: ${status}`);
  return NextResponse.json(requests.get(request.id));
}
