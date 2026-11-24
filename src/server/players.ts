import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';
import { rconCommand } from './rcon';
import { StoredServer, servers } from './store';

// no SimpleAdmin: players from RCON status, SteamIDs and joins from the server log (chat-log.ts),
// kicks via kickid, panel-side ban list enforced when a banned SteamID connects

export interface JoinEvent {
  t: number;
  name: string;
  steamid: string;
  event: 'join' | 'leave';
  address?: string;
  reason?: string;
}

export interface Ban {
  id: number;
  steamid: string;
  name: string;
  reason: string;
  minutes: number; // 0 = permanent
  created_at: string;
  expires_at?: string;
  by: string;
  unbanned_at?: string;
}

export interface LivePlayer {
  userid: number;
  name: string;
  steamid: string;
  address: string;
  connected: string;
  ping: number;
  state: string;
}

const KEEP_JOINS = 500;

const g = globalThis as unknown as {
  joinLogs?: Map<number, JoinEvent[]>;
  // userid -> connect info from the log, per server
  seen?: Map<number, Map<number, { name: string; steamid: string; address?: string }>>;
};
const joins = (g.joinLogs ??= new Map<number, JoinEvent[]>());
const seen = (g.seen ??= new Map<number, Map<number, { name: string; steamid: string; address?: string }>>());

const joinsFile = (serverId: number) => path.join(dataDir(), 'joins', `${serverId}.jsonl`);
const bansFile = () => path.join(dataDir(), 'bans.json');

// server IDs get reused (bans are panel-wide)
export function clearJoins(serverId: number) {
  joins.delete(serverId);
  seen.delete(serverId);
  fs.rmSync(joinsFile(serverId), { force: true });
}

function loadJoins(serverId: number) {
  let list = joins.get(serverId);
  if (list) return list;
  try {
    list = fs.readFileSync(joinsFile(serverId), 'utf8').trim().split('\n').slice(-KEEP_JOINS).map((l) => JSON.parse(l) as JoinEvent);
  } catch {
    list = [];
  }
  joins.set(serverId, list);
  return list;
}

function addJoin(serverId: number, e: JoinEvent) {
  const list = loadJoins(serverId);
  list.push(e);
  if (list.length > KEEP_JOINS) list.splice(0, list.length - KEEP_JOINS);
  try {
    fs.mkdirSync(path.dirname(joinsFile(serverId)), { recursive: true });
    fs.appendFileSync(joinsFile(serverId), JSON.stringify(e) + '\n');
    if (fs.statSync(joinsFile(serverId)).size > 300_000) fs.writeFileSync(joinsFile(serverId), list.map((j) => JSON.stringify(j)).join('\n') + '\n');
  } catch {
    // in-memory list still works
  }
}

export const joinLog = (serverId: number) => [...loadJoins(serverId)].reverse();

export function listBans(): Ban[] {
  try {
    return JSON.parse(fs.readFileSync(bansFile(), 'utf8')) as Ban[];
  } catch {
    return [];
  }
}

function saveBans(items: Ban[]) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(bansFile() + '.tmp', JSON.stringify(items, null, 2));
  fs.renameSync(bansFile() + '.tmp', bansFile());
}

export const isActive = (b: Ban) => !b.unbanned_at && (!b.expires_at || Date.parse(b.expires_at) > Date.now());
const activeBan = (steamid: string) => listBans().find((b) => b.steamid === steamid && isActive(b));

export function addBan(data: { steamid: string; name: string; reason: string; minutes: number; by: string }) {
  if (!/^\d{17}$/.test(data.steamid)) throw new Error('Нет SteamID игрока: сервер ещё не прислал лог с его входом');
  const items = listBans();
  const now = new Date();
  const ban: Ban = {
    id: items.reduce((max, b) => Math.max(max, b.id), 0) + 1,
    steamid: data.steamid,
    name: data.name,
    reason: data.reason,
    minutes: data.minutes,
    created_at: now.toISOString(),
    expires_at: data.minutes > 0 ? new Date(now.getTime() + data.minutes * 60_000).toISOString() : undefined,
    by: data.by,
  };
  saveBans([...items, ban]);
  return ban;
}

export function unban(id: number) {
  const items = listBans();
  const ban = items.find((b) => b.id === id);
  if (!ban) throw new Error('Бан не найден');
  ban.unbanned_at = new Date().toISOString();
  saveBans(items);
  return ban;
}

const clean = (s: string) => s.replace(/["\\;\r\n]/g, '').slice(0, 120);

export function kick(server: StoredServer, userid: number, reason: string) {
  return rconCommand(server.host, server.port, server.rcon_password, `kickid ${userid} "${clean(reason) || 'Kicked by referee'}"`);
}

function steam64(id: string) {
  const m = /^\[U:1:(\d+)\]$/.exec(id);
  return m ? (BigInt('76561197960265728') + BigInt(m[1])).toString() : id;
}

// "Name<2><[U:1:123]><>" connected, address "1.2.3.4:27005"
const CONNECTED = /"(.*)<(\d+)><([^>]*)><[^>]*>" connected, address "([^"]*)"/;
// "Name<2><[U:1:123]><CT>" disconnected (reason "Disconnect")
const DISCONNECTED = /"(.*)<(\d+)><([^>]*)><[^>]*>" disconnected(?: \(reason "([^"]*)"\))?/;

export function ingestPlayerLines(serverId: number, lines: string[]) {
  const map = seen.get(serverId) ?? new Map<number, { name: string; steamid: string; address?: string }>();
  seen.set(serverId, map);
  for (const line of lines) {
    let m = CONNECTED.exec(line);
    if (m) {
      const [, name, uid, rawId, address] = m;
      if (rawId === 'BOT') continue;
      const steamid = steam64(rawId);
      map.set(Number(uid), { name, steamid, address: address.split(':')[0] });
      addJoin(serverId, { t: Date.now(), name, steamid, event: 'join', address: address.split(':')[0] });
      const ban = activeBan(steamid);
      const server = servers.get(serverId);
      if (ban && server) kick(server, Number(uid), `Banned: ${ban.reason || 'by referee'}`).catch(() => {});
      continue;
    }
    m = DISCONNECTED.exec(line);
    if (m) {
      const [, name, uid, rawId, reason] = m;
      if (rawId === 'BOT') continue;
      map.delete(Number(uid));
      addJoin(serverId, { t: Date.now(), name, steamid: steam64(rawId), event: 'leave', reason });
    }
  }
}

// CS2: "    3      00:07   50    0     active 196608 127.0.0.1:62546 'Player'"
const STATUS_ROW = /^\s*(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\w+)\s+(\d+)\s*(\S+)\s+'(.*)'\s*$/;

export async function livePlayers(server: StoredServer): Promise<LivePlayer[]> {
  const out = await rconCommand(server.host, server.port, server.rcon_password, 'status');
  const known = seen.get(server.id) ?? new Map<number, { name: string; steamid: string; address?: string }>();
  const players: LivePlayer[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = STATUS_ROW.exec(line);
    if (!m) continue;
    const [, uid, time, ping, , state, , adr, name] = m;
    const userid = Number(uid);
    if (userid === 65535 || adr === 'BOT' || time === 'BOT' || adr.startsWith('loopback')) continue;
    const k = known.get(userid);
    players.push({
      userid,
      name,
      steamid: k?.steamid ?? '',
      address: adr.split(':')[0],
      connected: time,
      ping: Number(ping),
      state,
    });
  }
  return players;
}
