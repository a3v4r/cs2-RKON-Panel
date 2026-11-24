import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';
import { addressFor } from './network';
import { ingestPlayerLines } from './players';
import { rconCommand } from './rcon';
import { eventToken } from './session';
import { StoredServer } from './store';

// CS2 log arrives over HTTP (logaddress_add_http); only say / say_team are kept

export interface ChatMessage {
  t: number; // received at, ms
  name: string;
  steamid: string; // SteamID64, or as logged (BOT, Console)
  team: string; // CT, TERRORIST, Spectator, Console...
  type: 'say' | 'say_team';
  text: string;
}

const KEEP = 500;

const g = globalThis as unknown as { chatLogs?: Map<number, ChatMessage[]> };
const logs = (g.chatLogs ??= new Map<number, ChatMessage[]>());

const dir = () => path.join(dataDir(), 'chat');
const file = (serverId: number) => path.join(dir(), `${serverId}.jsonl`);

// server IDs get reused
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
    // compact once the file is about twice the kept size
    if (fs.statSync(file(serverId)).size > 400_000) fs.writeFileSync(file(serverId), list.map((m) => JSON.stringify(m)).join('\n') + '\n');
  } catch {
    // best effort, the in-memory list still works
  }
}

// [U:1:12345] -> 76561197960278073
function steam64(id: string) {
  const m = /^\[U:1:(\d+)\]$/.exec(id);
  return m ? (BigInt('76561197960265728') + BigInt(m[1])).toString() : id;
}

// 11/21/2026 - 18:04:20.123 - "Player<2><[U:1:12345]><CT>" say "gg wp"
const SAY = /"(.*)<\d+><([^>]*)><([^>]*)>" (say|say_team) "(.*)"\s*$/;
// console say (incl. the panel's Chat) has no SteamID or team:
// 11/21/2026 - 15:48:40: "Console<0>" say "text"
const CONSOLE_SAY = /"Console<\d+>" (say) "(.*)"\s*$/;

export function ingestLog(serverId: number, body: string) {
  const lines = body.split(/\r?\n/);
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

// token instead of a login: the game server can't log in
export async function chatLogUrl(server: StoredServer) {
  const host = server.managed ? '127.0.0.1' : await addressFor(server.host);
  return `http://${host}:${port()}/api/logs/${server.id}/${eventToken(server.id)}`;
}

export async function chatCfgLines(server: StoredServer) {
  return ['log on', 'logaddress_delall_http', `logaddress_add_http "${await chatLogUrl(server)}"`];
}

// servers started elsewhere; lasts until their restart
export async function attachChat(server: StoredServer) {
  for (const command of await chatCfgLines(server)) {
    await rconCommand(server.host, server.port, server.rcon_password, command);
  }
}
