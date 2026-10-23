import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ingestChatLog } from '@/server/chat-log';
import { eventToken } from '@/server/session';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ serverId: string }> };

// CS2 starts an HTTP log subscription with the whole current log file and then sends only new
// bytes. Keeping the last part is enough for chat and for the live match state, and it keeps
// memory flat when that first snapshot is large.
const KEEP_TAIL_BYTES = 8 * 1024 * 1024;

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readLogTail(req: Request): Promise<{ buffer: Buffer; droppedBytes: number }> {
  if (!req.body) return { buffer: Buffer.alloc(0), droppedBytes: 0 };
  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    size += chunk.length;
    total += chunk.length;
    while (size > KEEP_TAIL_BYTES) {
      const excess = size - KEEP_TAIL_BYTES;
      const first = chunks[0];
      if (first.length <= excess) {
        chunks.shift();
        size -= first.length;
      } else {
        chunks[0] = first.subarray(excess);
        size -= excess;
      }
    }
  }
  const buffer = Buffer.concat(chunks);
  let droppedBytes = total - buffer.length;
  if (droppedBytes === 0) return { buffer, droppedBytes: 0 };
  // The tail starts in the middle of a line; the first newline starts a complete one.
  const newline = buffer.indexOf(0x0a);
  if (newline < 0) return { buffer: Buffer.alloc(0), droppedBytes: total };
  droppedBytes += newline + 1;
  return { buffer: buffer.subarray(newline + 1), droppedBytes };
}

// CS2 HTTP log destination (logaddress_add_http). Public by design: the game server has no
// panel session, so the per-server token in the URL authenticates it. Only log lines are accepted.
export async function POST(req: Request, { params }: Params) {
  const serverId = Number((await params).serverId);
  if (!Number.isInteger(serverId) || !servers.get(serverId)) {
    return NextResponse.json({ error: 'Сервер не найден' }, { status: 404 });
  }

  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!tokenMatches(token, eventToken(serverId))) {
    return NextResponse.json({ error: 'bad token' }, { status: 401 });
  }

  const { buffer, droppedBytes } = await readLogTail(req);
  const beginHeader = req.headers.get('x-logbytes-beginoffset');
  const endHeader = req.headers.get('x-logbytes-endoffset');
  const begin = Number(beginHeader);
  const end = Number(endHeader);
  const meta = beginHeader != null && endHeader != null && Number.isFinite(begin) && Number.isFinite(end)
    ? {
      begin,
      end,
      droppedBytes,
      instance: req.headers.get('x-server-instance-token'),
    }
    : undefined;

  if (buffer.length > 0 || meta) ingestChatLog(serverId, buffer, meta);
  // CS2 treats 204 as "not delivered" and retries the same whole chunk forever;
  // a plain 200 with a body makes it advance to the next byte range.
  return new NextResponse('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
}
