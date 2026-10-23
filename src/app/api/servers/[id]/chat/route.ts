import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { clearChat, getChat } from '@/server/chat';
import { chatCollectorStatus } from '@/server/chat-log';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Collected player chat. Reading it is a normal panel request; collecting it happens on the
// panel server in the background (see src/server/chat-log.ts), not while this tab is open.
export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const server = servers.get(id);
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  return NextResponse.json({
    messages: getChat(id),
    collector: chatCollectorStatus(id),
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const server = servers.get(id);
  if (!server) return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  clearChat(id);
  audit(user, `chat clear #${server.id} ${server.name}`);
  return NextResponse.json({ ok: true });
}
