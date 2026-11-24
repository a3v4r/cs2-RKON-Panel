import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { procState, restartServer, startServer, stopServer } from '@/server/instances';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const ACTIONS = { start: startServer, stop: stopServer, restart: restartServer } as const;

export async function POST(req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const server = servers.get(id);
  if (!server?.managed) return NextResponse.json({ error: 'Этот сервер запускается не из панели' }, { status: 400 });
  const { action } = await req.json().catch(() => ({}));
  const run = ACTIONS[action as keyof typeof ACTIONS];
  if (!run) return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  try {
    await run(id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  audit(user, `server ${action} #${id} ${server.name}`);
  return NextResponse.json(procState(id));
}
