import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { attachChat, chatSince } from '@/server/chat-log';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// In-game chat history; ?since=<ms> returns only newer messages
export async function GET(req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const since = Number(new URL(req.url).searchParams.get('since') ?? 0) || 0;
  return NextResponse.json(chatSince(id, since));
}

// Tell the game server to send its log (with the chat) to the panel
export async function POST(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const server = servers.get(Number((await params).id));
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  try {
    await attachChat(server);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  audit(user, `chat log attach #${server.id} ${server.name}`);
  return NextResponse.json({ ok: true });
}
