import { NextResponse } from 'next/server';
import { getMatchConfig } from '@/server/matches';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const config = getMatchConfig((await params).id);
  if (!config) return NextResponse.json({ error: 'No config loaded' }, { status: 404 });
  return new NextResponse(config, { headers: { 'Content-Type': 'application/json' } });
}
