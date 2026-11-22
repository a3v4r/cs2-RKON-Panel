import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { joinLog } from '@/server/players';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Join / leave history of the server, newest first
export async function GET(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(joinLog(Number((await params).id)));
}
