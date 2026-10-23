import { TextDecoder } from 'node:util';
import { addChat } from './chat';
import { ingestGameLog } from './game-log';
import { addressFor } from './network';
import { rconCommand } from './rcon';
import { eventToken } from './session';
import { servers } from './store';

// CS2 writes player chat to its server log. Modern CS2 no longer supports the classic UDP
// logaddress_add, but it can POST the same log lines over HTTP (logaddress_add_http).
// The panel subscribes the game server to /api/chat-log/<id> on itself, so collection happens
// on the panel server: no browser and no judge has to be in the Chat tab.
const TICK_MS = 30_000;
// Without logaddress_list_http there is no way to check a live subscription. Re-adding it
// periodically restores collection after a game server restart; duplicates are deduped by chat.ts.
const RE_ADD_MS = 10 * 60_000;

export interface ChatCollectorStatus {
  // URL the game server posts its log to, as seen from that server (the token is not shown)
  url: string | null;
  lastPacketAt: string | null;
  lastConfiguredAt: string | null;
  lastError: string | null;
}

// Byte range of one HTTP log post. CS2 resends a whole file after a new logaddress_add_http,
// so the cursor keeps the already processed bytes from being imported as fresh chat.
export interface ChatLogMeta {
  begin: number;
  end: number;
  droppedBytes: number;
  instance: string | null;
}

interface LogCursor {
  end: number;
  instance: string | null;
  // End time of the last processed log line, for telling a new log file from a replayed old one
  lastTime: number | null;
}

const globalForChatLog = globalThis as unknown as {
  chatLogStatus?: Map<number, ChatCollectorStatus>;
  chatLogCursor?: Map<number, LogCursor>;
  chatLogTimer?: NodeJS.Timeout;
  chatLogBusy?: boolean;
  chatLogListUnsupported?: Map<number, boolean>;
};

const statuses = (globalForChatLog.chatLogStatus ??= new Map<number, ChatCollectorStatus>());
const cursors = (globalForChatLog.chatLogCursor ??= new Map<number, LogCursor>());
const listUnsupported = (globalForChatLog.chatLogListUnsupported ??= new Map<number, boolean>());

function panelPort(): number {
  const value = Number(process.env.PORT);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 3000;
}

export function chatLogUrl(serverId: number, host: string): string {
  return `http://${host}:${panelPort()}/api/chat-log/${serverId}`;
}

const emptyStatus = (): ChatCollectorStatus => ({
  url: null,
  lastPacketAt: null,
  lastConfiguredAt: null,
  lastError: null,
});

function status(serverId: number): ChatCollectorStatus {
  const existing = statuses.get(serverId);
  if (existing) return existing;
  const created = emptyStatus();
  statuses.set(serverId, created);
  return created;
}

export function chatCollectorStatus(serverId: number): ChatCollectorStatus {
  return { ...(statuses.get(serverId) ?? emptyStatus()) };
}

// CS2 is UTF-8. A server started with an old locale can write the Windows Cyrillic
// encoding instead, so a strict UTF-8 decode falls back to windows-1251.
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const cp1251Decoder = new TextDecoder('windows-1251');

export function decodeLogBuffer(buffer: Buffer): string {
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    try {
      return cp1251Decoder.decode(buffer);
    } catch {
      return buffer.toString('utf8');
    }
  }
}

// Source log lines may contain colour/format control bytes; they must not reach the UI.
const clean = (value: string) =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\uFEFF/g, '').trim();

// "Name<2><STEAM_1:0:123><CT>" say "text"
// "Name<2><STEAM_1:0:123><CT>" say_team "text"
// Console lines carry only the user id: "Console<0>" say "text"
// With an optional "L " and a "MM/DD/YYYY - HH:MM:SS: " prefix, as written to Source logs.
// Source writes timestamps in two shapes: the live "L MM/DD/YYYY - HH:MM:SS: " console
// prefix and the log-file "MM/DD/YYYY - HH:MM:SS.mmm - " prefix.
const CHAT_LINE = /^(?:L\s+)?(?:\d{1,2}\/\d{1,2}\/\d{4} - \d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?: - |: ))?"(.*)<(\d+)>(?:<([^>]*)>)?(?:<([^>]*)>)?"\s+(say|say_team)\s+"([\s\S]*)"\s*$/u;

export function parseChatLine(raw: string) {
  const line = clean(raw);
  const match = CHAT_LINE.exec(line);
  if (!match) return null;
  const [, author, , steamId, rawTeam, command, text] = match;
  if (!clean(text)) return null;

  const teamRaw = (rawTeam ?? '').trim().toUpperCase();
  const team = teamRaw === 'TERRORIST' ? 'T'
    : teamRaw === 'SPECTATOR' || teamRaw === 'SPEC' ? 'SPEC'
      : teamRaw === 'CT' || teamRaw === 'T' ? teamRaw
        : '';
  return {
    author: clean(author) || 'Игрок',
    steamId: clean(steamId ?? ''),
    team,
    teamOnly: command === 'say_team',
    text: clean(text),
    console: /^console$/i.test(clean(author)) || /^console$/i.test(clean(steamId ?? '')),
  };
}

// "10/23/2026 - 12:49:04.528" in the game server's clock. Only used to order chunks.
function parseLogTime(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) - (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const [, month, day, year, hour, minute, second, millis] = match;
  return Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second), Number((millis ?? '0').padEnd(3, '0')),
  );
}

// The last complete log line's time. The request header carries the current time, which is the
// same for a replayed old chunk, so the body itself is the only reliable source here.
function lastLogTime(buffer: Buffer): number | null {
  if (buffer.length === 0) return null;
  const tail = buffer.subarray(Math.max(0, buffer.length - 16 * 1024)).toString('latin1');
  const matches = tail.matchAll(/(?:^|\n)(?:L\s+)?(\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?) - /g);
  let last: string | null = null;
  for (const match of matches) last = match[1];
  return parseLogTime(last);
}

// Called by the public HTTP log endpoint for every batch CS2 posts.
export function ingestChatLog(serverId: number, payload: Buffer | string, meta?: ChatLogMeta) {
  const state = status(serverId);
  state.lastPacketAt = new Date().toISOString();
  // A delivered log line proves the subscription works; clear an old setup error.
  state.lastError = null;

  let data = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;

  if (meta) {
    const cursor = cursors.get(serverId) ?? { end: 0, instance: null, lastTime: null };
    cursors.set(serverId, cursor);
    const chunkTime = lastLogTime(data);

    // A new game server process starts a new log file, so offsets begin from zero again.
    // A re-added logaddress on the same process also starts at zero, but its instance token
    // is unchanged and its chunks are skipped by the cursor below.
    const instanceChanged = !!cursor.instance && !!meta.instance && cursor.instance !== meta.instance;
    const resetWithoutToken = !cursor.instance && !meta.instance && meta.begin === 0 && meta.end < cursor.end;
    // The game can start a new log file without restarting (map change, log toggled). Its
    // offsets also reset to zero; the later last line tells it apart from a replayed old chunk.
    const newLogFile = meta.begin === 0 && meta.end <= cursor.end && cursor.end > 0
      && chunkTime != null && cursor.lastTime != null && chunkTime > cursor.lastTime;
    if (instanceChanged || resetWithoutToken || newLogFile) {
      cursor.end = 0;
      cursor.lastTime = null;
    }

    if (cursor.end > 0) {
      // The whole range was already processed (a re-added logaddress resends the file).
      if (meta.end <= cursor.end) {
        if (meta.instance) cursor.instance = meta.instance;
        return;
      }
      // The retained tail starts at begin + droppedBytes; skip bytes already handled.
      const base = meta.begin + meta.droppedBytes;
      if (base < cursor.end) {
        const skip = cursor.end - base;
        if (skip >= data.length) {
          cursor.end = meta.end;
          if (chunkTime != null) cursor.lastTime = chunkTime;
          if (meta.instance) cursor.instance = meta.instance;
          return;
        }
        data = data.subarray(skip);
      }
    }

    cursor.end = meta.end;
    if (chunkTime != null) cursor.lastTime = chunkTime;
    if (meta.instance) cursor.instance = meta.instance;
  }

  const text = decodeLogBuffer(data);
  for (const line of text.split(/\r?\n/)) {
    // The same feed also drives the MatchZy-independent live match view (game-log.ts).
    ingestGameLog(serverId, line);
    const parsed = parseChatLine(line);
    if (parsed) addChat(serverId, parsed);
  }
}

// The game server forgets its log destination on restart. The address is re-checked every
// tick: with logaddress_list_http a missing entry is restored immediately, otherwise the
// subscription is refreshed every RE_ADD_MS.
async function ensureSubscription(server: NonNullable<ReturnType<typeof servers.get>>) {
  const state = status(server.id);

  let host: string;
  try {
    host = await addressFor(server.host);
  } catch (e) {
    state.lastError = `не удалось определить адрес панели: ${(e as Error).message}`;
    return;
  }

  const url = chatLogUrl(server.id, host);
  state.url = url;
  // The token keeps the endpoint public for the game server but useless to everyone else.
  const destination = `${url}?token=${eventToken(server.id)}`;
  const rcon = (command: string) =>
    rconCommand(server.host, server.port, server.rcon_password, command, { timeoutMs: 5000 });

  try {
    await rcon('log on');

    let listed: string | null = null;
    if (!listUnsupported.get(server.id)) {
      const output = await rcon('logaddress_list_http');
      if (/unknown command|invalid command/i.test(output)) {
        listUnsupported.set(server.id, true);
      } else {
        listed = output;
      }
    }

    if (listed !== null && listed.includes(destination)) {
      state.lastConfiguredAt ??= new Date().toISOString();
      state.lastError = null;
      return;
    }
    if (listed === null && state.lastConfiguredAt
      && Date.now() - Date.parse(state.lastConfiguredAt) < RE_ADD_MS) {
      state.lastError = null;
      return;
    }

    // CS2 requires the URI to be quoted.
    await rcon(`logaddress_add_http "${destination}"`);
    state.lastConfiguredAt = new Date().toISOString();
    state.lastError = null;
  } catch (e) {
    state.lastError = (e as Error).message;
  }
}

async function tick() {
  const list = servers.list();
  const ids = new Set(list.map((s) => s.id));
  for (const id of statuses.keys()) {
    if (ids.has(id)) continue;
    statuses.delete(id);
    cursors.delete(id);
    listUnsupported.delete(id);
  }
  await Promise.allSettled(list.map((server) => ensureSubscription(server)));
}

export function startChatCollector() {
  if (globalForChatLog.chatLogTimer) return;
  const run = () => {
    if (globalForChatLog.chatLogBusy) return;
    globalForChatLog.chatLogBusy = true;
    tick()
      .catch(() => {})
      .finally(() => { globalForChatLog.chatLogBusy = false; });
  };
  run();
  globalForChatLog.chatLogTimer = setInterval(run, TICK_MS);
  globalForChatLog.chatLogTimer.unref?.();
}
