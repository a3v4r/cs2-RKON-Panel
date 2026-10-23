import type { LiveState } from './live';

// The CS2 "status" reply is the only read-only RCON command that reports per-player
// ping, packet loss and state. It looks like this (the header line and rows all start with "#"):
//
//   # userid name                uniqueid            connected ping loss state  rate  adr
//   #  2 1 "Player"            [U:1:123456]        00:27       20    0 active 786432  1.2.3.4:27005
//
// Bots have "BOT" as their uniqueid and no ping.

export interface ServerPlayer {
  userid: number | null;
  name: string;
  // Steam64 when the uniqueid could be understood, otherwise null
  steamid: string | null;
  uniqueid: string;
  bot: boolean;
  ping: number | null;
  loss: number | null;
  state: string;
  connectedSeconds: number | null;
  // MatchZy teams from the panel's event state; null when no match is tracked
  team: 'team1' | 'team2' | null;
  side: 'ct' | 't' | null;
}

// The part of get5_status used here: which side each team plays on
export interface MatchStatusTeams {
  matchid?: number | null;
  team1?: { side?: string | null } | null;
  team2?: { side?: string | null } | null;
}

const PLAYER_LINE = /^#\s+(\d+)\s+(\d+)\s+"(.*)"\s+(.+?)\s*$/;
const STEAM64_BASE = 76561197960265728n;

// SteamID64 from "[U:1:123]", "STEAM_0:1:123" or an already converted id
export function steamId64(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{17}$/.test(value)) return value;

  const unified = /^\[U:1:(\d+)\]$/.exec(value);
  if (unified) return (STEAM64_BASE + BigInt(unified[1])).toString();

  const steam2 = /^STEAM_[0-5]:([01]):(\d+)$/i.exec(value);
  if (steam2) return (STEAM64_BASE + BigInt(steam2[2]) * 2n + BigInt(steam2[1])).toString();

  return null;
}

function numberOrNull(value: string | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// "00:27" (minutes:seconds) or "1:02:03" (hours:minutes:seconds)
function clockOrNull(value: string): number | null {
  if (!/^\d+(?::\d+){1,2}$/.test(value)) return null;
  return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

export function parseStatus(output: string): ServerPlayer[] {
  const players: ServerPlayer[] = [];

  for (const raw of output.split(/\r?\n/)) {
    const line = raw.replace(/[\x00-\x1f]/g, '').trim();
    const match = PLAYER_LINE.exec(line);
    if (!match) continue;

    const [, userid, , name, tail] = match;
    // uniqueid connected ping loss state [rate] [address]
    const fields = tail.trim().split(/\s+/);
    const [uniqueid = '', connected = '', ping = '', loss = '', state = ''] = fields;
    const bot = uniqueid.toUpperCase() === 'BOT';

    players.push({
      userid: numberOrNull(userid),
      name: name || 'без имени',
      steamid: bot ? null : steamId64(uniqueid),
      uniqueid: bot ? '' : uniqueid,
      bot,
      ping: bot ? null : numberOrNull(ping),
      loss: bot ? null : numberOrNull(loss),
      state: state || (bot ? 'active' : ''),
      connectedSeconds: clockOrNull(connected),
      team: null,
      side: null,
    });
  }

  return players;
}

// The table header is printed even when nobody is connected; without it the reply was
// empty or in an unknown format, and an empty player list would be misleading.
export function hasPlayerTable(output: string): boolean {
  return /^#\s*userid\b/im.test(output);
}

const sideOf = (value: unknown): 'ct' | 't' | null => (value === 'ct' || value === 't' ? value : null);

// MatchZy events (live.ts) know which players belong to which team. Team names are not
// part of "status", so this only fills the list when the match was launched from the panel.
export function attachTeamInfo(players: ServerPlayer[], live: LiveState | null, status: MatchStatusTeams | null) {
  if (!live) return;

  const teams = new Map<string, 'team1' | 'team2'>();
  const collect = (team: 'team1' | 'team2', list: { steamid: string }[]) => {
    for (const player of list) {
      const id = player.steamid ? steamId64(player.steamid) : null;
      if (id) teams.set(id, team);
    }
  };
  collect('team1', live.team1.players);
  collect('team2', live.team2.players);
  if (teams.size === 0) return;

  const side1 = sideOf(status?.team1?.side);
  const side2 = sideOf(status?.team2?.side);
  for (const player of players) {
    const team = player.steamid ? teams.get(player.steamid) : undefined;
    if (!team) continue;
    player.team = team;
    player.side = team === 'team1' ? side1 : side2;
  }
}
