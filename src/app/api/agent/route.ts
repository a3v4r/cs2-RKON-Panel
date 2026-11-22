import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { SessionUser } from '@/server/session';
import { agentTurn, agentView, listModels, saveAgentSettings } from '@/server/agent';

export const dynamic = 'force-dynamic';
// A turn may take several model calls
export const maxDuration = 300;

// Only the shared account admin may use the agent: it can do anything the panel can, with that account's rights
async function requireAdmin() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (user.name) return NextResponse.json({ error: 'Агент доступен только аккаунту admin' }, { status: 403 });
  return user as SessionUser;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(agentView());
}

// Connection settings: { baseUrl?, apiKey?, model? }
export async function PUT(req: Request) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json(saveAgentSettings(await req.json().catch(() => ({}))));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// { action: 'models' } | { messages, decisions? } - one turn of the chat
export async function POST(req: Request) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'models') return NextResponse.json(await listModels());
    const ctx = { cookie: req.headers.get('cookie') ?? undefined, selectedServerId: Number(body.selectedServerId) || undefined };
    if (!body.stream) return NextResponse.json(await agentTurn(body.messages, body.decisions, user, ctx));

    // The chat shows the steps as they happen: one JSON event per line, the whole conversation at the end
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        try {
          const result = await agentTurn(body.messages, body.decisions, user, ctx, (message) => send({ type: 'message', message }));
          send({ type: 'done', ...result });
        } catch (e) {
          send({ type: 'error', error: (e as Error).message });
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
