import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';
import { addressFor } from './network';
import { ingestPlayerLines } from './players';
import { rconCommand } from './rcon';
import { eventToken } from './session';
import { StoredServer } from './store';

// In-game chat history, as on the Quatrix chat page. CS2 sends its log to the panel over HTTP
// (logaddress_add_http); the say / say_team lines are kept here, the rest of the log is ignored.

export interface ChatMessage {
  t: number; // when the panel received it, ms
  name: string;
  steamid: string; // SteamID64 when the log has one, else as logged (BOT, Console)
  team: string; // CT, TERRORIST, Spectator, Console...
  type: 'say' | 'say_team';
  text: string;
}

const KEEP = 500;

const g = globalThis as unknown as { chatLogs?: Map<number, ChatMessage[]> };
const logs = (g.chatLogs ??= new Map<number, ChatMessage[]>());

const dir = () => path.join(dataDir(), 'chat');
const file = (serverId: number) => path.join(dir(), `${serverId}.jsonl`);

// A deleted server's ID is given to the next new one: its chat must not carry over
export function clearChat(serverId: number) {
  logs.delete(serverId);
  fs.rmSync(file(serverId), { force: true });
}

function load(serverId: number): ChatMessage[] {
  let list = logs.get(serverId);
  if (list) return list;
  list = [];
  try {
    list = fs.readFileSync(file(serverId), 'utf8').trim().split('\n').slice(-KEEP).map((l) => JSON.parse(l) as ChatMessage);
  } catch {
    // no history yet
  }
  logs.set(serverId, list);
  return list;
}

function save(serverId: number, added: ChatMessage[], list: ChatMessage[]) {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.appendFileSync(file(serverId), added.map((m) => JSON.stringify(m)).join('\n') + '\n');
    // Keep the file from growing forever: rewrite it with the kept messages once it is twice as long
    if (fs.statSync(file(serverId)).size > 400_000) fs.writeFileSync(file(serverId), list.map((m) => JSON.stringify(m)).join('\n') + '\n');
  } catch {
    // history on disk is a convenience; the live list still works
  }
}

// [U:1:12345] -> 76561197960278073
function steam64(id: string) {
  const m = /^\[U:1:(\d+)\]$/.exec(id);
  return m ? (BigInt('76561197960265728') + BigInt(m[1])).toString() : id;
}

// 11/21/2026 - 18:04:20.123 - "Player<2><[U:1:12345]><CT>" say "gg wp"
const SAY = /"(.*)<\d+><([^>]*)><([^>]*)>" (say|say_team) "(.*)"\s*$/;
// CS2 logs `say` from the server console (and the panel's Chat) without SteamID and team:
// 11/21/2026 - 15:48:40: "Console<0>" say "text"
const CONSOLE_SAY = /"Console<\d+>" (say) "(.*)"\s*$/;

export function ingestLog(serverId: number, body: string) {
  const lines = body.split(/\r?\n/);
  // Joins, leaves and kicking banned players (Players page)
  ingestPlayerLines(serverId, lines);
  const added: ChatMessage[] = [];
  const now = Date.now();
  for (const line of lines) {
    const m = SAY.exec(line);
    if (!m) {
      const c = CONSOLE_SAY.exec(line);
      if (c) added.push({ t: now, name: 'Console', steamid: 'Console', team: 'Console', type: 'say', text: c[2] });
      continue;
    }
    added.push({ t: now, name: m[1], steamid: steam64(m[2]), team: m[3], type: m[4] as ChatMessage['type'], text: m[5] });
  }
  if (!added.length) return;
  const list = load(serverId);
  list.push(...added);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  save(serverId, added, list);
}

export function chatSince(serverId: number, since = 0) {
  return load(serverId).filter((m) => m.t > since);
}

const port = () => Number(process.env.PORT || 3000);

// Where the game server sends its log; the per-server token stands in for a login (the server cannot log in)
export async function chatLogUrl(server: StoredServer) {
  const host = server.managed ? '127.0.0.1' : await addressFor(server.host);
  return `http://${host}:${port()}/api/logs/${server.id}/${eventToken(server.id)}`;
}

// cfg lines for servers the panel starts itself
export async function chatCfgLines(server: StoredServer) {
  return ['log on', 'logaddress_delall_http', `logaddress_add_http "${await chatLogUrl(server)}"`];
}

// For servers started elsewhere: turn logging on over RCON (it lasts until the server restarts)
export async function attachChat(server: StoredServer) {
  for (const command of await chatCfgLines(server)) {
    await rconCommand(server.host, server.port, server.rcon_password, command);
  }
}
