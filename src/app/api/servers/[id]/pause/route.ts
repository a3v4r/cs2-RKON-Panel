import { NextResponse } from 'next/server';
import { ANY_ROLE, audit, requireRole } from '@/server/auth';
import { pauses } from '@/server/pauses';
import { rconCommand } from '@/server/rcon';
import { servers } from '@/server/store';

type Params = { params: Promise<{ id: string }> };

// Admin pause (players cannot lift it) and its release; the only match control the broadcast role has.
// Players see in chat who paused and why.
export async function POST(req: Request, { params }: Params) {
  const user = await requireRole(ANY_ROLE);
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });

  const { action } = await req.json();
  if (action !== 'pause' && action !== 'unpause') {
    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  }
  if (action === 'unpause' && user.role === 'broadcast' && !pauses.isBroadcast(server.id)) {
    return NextResponse.json(
      { error: 'Эту паузу ставила не трансляция - снять её может только судья' },
      { status: 409 },
    );
  }
  if (action === 'pause' && user.role === 'broadcast') {
    // Pausing over someone else's pause would make it "ours" and let the broadcast lift it
    const status = await rconCommand(server.host, server.port, server.rcon_password, 'get5_status')
      .then((out) => JSON.parse(out.slice(out.indexOf('{'))))
      .catch(() => null);
    if (status?.paused) {
      return NextResponse.json({ error: 'Матч уже на паузе' }, { status: 409 });
    }
  }
  const who = user.role === 'broadcast' ? 'трансляции' : 'судьи';
  const commands = action === 'pause'
    ? ['css_forcepause', `say Пауза по запросу ${who}`]
    : [`say Матч продолжается (снято ${user.role === 'broadcast' ? 'трансляцией' : 'судьёй'})`, 'css_forceunpause'];

  audit(user, `${action} #${server.id} ${server.name}`);
  try {
    let output = '';
    for (const command of commands) {
      output += await rconCommand(server.host, server.port, server.rcon_password, command);
    }
    if (action === 'pause' && user.role === 'broadcast') pauses.markBroadcast(server.id);
    if (action === 'unpause') pauses.clear(server.id);
    return NextResponse.json({ output });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
