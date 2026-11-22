import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { cs2Dir, cs2Paths, readSettings, writeSettings } from '@/server/panel-settings';
import { DEFAULT_CHAT_PREFIX, applyChatPrefix, cleanChatPrefix, matchzyChatPrefix } from '@/server/chat-prefix';
import { allStates } from '@/server/instances';
import { rconCommand } from '@/server/rcon';
import { servers } from '@/server/store';

export const dynamic = 'force-dynamic';

function view() {
  const s = readSettings();
  const p = cs2Paths();
  return {
    cs2Dir: cs2Dir(),
    cs2Found: fs.existsSync(p.exe),
    steamcmd: p.steamcmd,
    steamcmdFound: fs.existsSync(p.steamcmd),
    panelName: s.panelName ?? '',
    defaultPort: s.defaultPort ?? 27015,
    chatPrefix: s.chatPrefix ?? DEFAULT_CHAT_PREFIX,
  };
}

export async function GET() {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(view());
}

// Any subset of: cs2Dir, steamcmd, panelName, defaultPort, chatPrefix
export async function PUT(req: Request) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (body.cs2Dir !== undefined) {
    const dir = String(body.cs2Dir).trim();
    if (!dir) return NextResponse.json({ error: 'Укажите папку' }, { status: 400 });
    update.cs2Dir = dir;
  }
  if (body.steamcmd !== undefined) update.steamcmd = String(body.steamcmd).trim() || undefined;
  if (body.panelName !== undefined) update.panelName = String(body.panelName).trim().slice(0, 40) || undefined;
  if (body.defaultPort !== undefined) {
    const port = Number(body.defaultPort);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return NextResponse.json({ error: 'Порт: число от 1024 до 65535' }, { status: 400 });
    update.defaultPort = port;
  }
  if (body.chatPrefix !== undefined) update.chatPrefix = cleanChatPrefix(String(body.chatPrefix)) || undefined;
  writeSettings(update);
  audit(user, `settings ${Object.keys(update).join(', ')}`);
  if ('chatPrefix' in update) await applyChatPrefixNow();
  return NextResponse.json(view());
}

// Plugin configs for the next start; MatchZy on running servers right away (WeaponPaints reads it on start)
async function applyChatPrefixNow() {
  try {
    applyChatPrefix();
  } catch {
    // config written again on the next server start
  }
  const states = allStates();
  await Promise.allSettled(servers.list()
    .filter((s) => states[s.id]?.state === 'running')
    .map((s) => rconCommand(s.host, s.port, s.rcon_password, `matchzy_chat_prefix ${matchzyChatPrefix()}`)));
}
