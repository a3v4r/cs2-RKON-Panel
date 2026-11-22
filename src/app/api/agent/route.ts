import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { agentTurn, agentView, listModels, saveAgentSettings } from '@/server/agent';

export const dynamic = 'force-dynamic';
// A turn may take several model calls
export const maxDuration = 300;

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(agentView());
}

// Connection settings: { baseUrl?, apiKey?, model? }
export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json(saveAgentSettings(await req.json().catch(() => ({}))));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// { action: 'models' } | { messages, decisions? } - one turn of the chat
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'models') return NextResponse.json(await listModels());
    return NextResponse.json(await agentTurn(body.messages, body.decisions, user));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
