import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';

// Generic match state read from the game server's own log stream (the same HTTP feed the panel
// already collects for chat, see chat-log.ts). It does not need MatchZy: a vanilla server, a
// match started from the console and a match run by another plugin all write these lines.
//
// The log gives sides, not team names ("Team \"CT\" scored..."). The state keeps two team
// slots and remembers which one is currently on CT, so the score stays a team score across
// the halftime swap; the UI can only label the slots by their current side (CT/T), because
// names exist only in MatchZy. Team names, series scores and player stats still come from
// MatchZy when it is running.
export type GameLogSide = 'ct' | 't';
export type GameLogPhase = 'idle' | 'live' | 'round_over' | 'finished';

export interface GameLogRound {
  // 0-based: round 0 is the first round of the map
  round: number;
  winner: GameLogSide;
}

export interface GameLogKill {
  round: number;
  attacker: string | null;
  attackerSide: GameLogSide | null;
  victim: string;
  victimSide: GameLogSide | null;
  weapon: string;
  headshot: boolean;
}

export interface GameLogState {
  map: string | null;
  // Team scores, independent of the side they were won on
  score1: number;
  score2: number;
  // Which team slot plays CT now; the other one plays T
  ctTeam: 'team1' | 'team2';
  // Regulation rounds per half: 12 for MR12, 15 for MR15 (from mp_maxrounds when available)
  halfLength: number;
  // Total rounds at the last side swap, so a swap happens once per half
  lastSwapTotal: number | null;
  rounds: GameLogRound[];
  kills: GameLogKill[];
  phase: GameLogPhase;
  // True between Match_Start and Game_Over, and from the first scored round of a match whose
  // Match_Start line was missed (the panel was not running yet, for example).
  started: boolean;
  // Last log timestamp/line seen, so a re-posted log file (CS2 sends the current file when the
  // HTTP subscription is renewed) cannot replay old rounds into the current score.
  lastLogStamp: string | null;
  lastLogLine: string | null;
  updatedAt: string;
}

const KILLS_KEPT = 30;
const ROUNDS_KEPT = 100;
const DEDUPE_MS = 1500;
const DEFAULT_HALF = 12;
const MAX_HALF = 30;

const globalForGameLog = globalThis as unknown as {
  gameLogStates?: Map<number, GameLogState>;
  gameLogLastLine?: Map<string, number>;
  gameLogHalfLengths?: Map<number, number>;
  gameLogLastStamp?: Map<number, string>;
  gameLogCurrentLine?: Map<number, string>;
};
const states = (globalForGameLog.gameLogStates ??= new Map<number, GameLogState>());
const lastLines = (globalForGameLog.gameLogLastLine ??= new Map<string, number>());
const halfLengths = (globalForGameLog.gameLogHalfLengths ??= new Map<number, number>());
const lastStamps = (globalForGameLog.gameLogLastStamp ??= new Map<number, string>());
const currentLines = (globalForGameLog.gameLogCurrentLine ??= new Map<number, string>());
const file = (serverId: number) => path.join(dataDir(), `game-log-${serverId}.json`);

const int = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);
const clampHalf = (value: unknown) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
  return n >= 1 && n <= MAX_HALF ? n : DEFAULT_HALF;
};

const fresh = (serverId: number, map: string | null = null): GameLogState => ({
  map,
  score1: 0,
  score2: 0,
  ctTeam: 'team1',
  halfLength: halfLengths.get(serverId) ?? DEFAULT_HALF,
  lastSwapTotal: null,
  rounds: [],
  kills: [],
  phase: 'idle',
  started: false,
  lastLogStamp: null,
  lastLogLine: null,
  updatedAt: new Date().toISOString(),
});

function load(serverId: number): GameLogState | null {
  if (!states.has(serverId)) {
    try {
      // `ctScore`/`tScore` are from the first version of this file (side scores); accept them
      // so a panel updated in place does not lose its current match.
      const stored = JSON.parse(fs.readFileSync(file(serverId), 'utf8')) as Partial<GameLogState> & {
        ctScore?: number;
        tScore?: number;
      };
      const state: GameLogState = {
        map: typeof stored.map === 'string' && stored.map ? stored.map : null,
        score1: int(stored.score1 ?? stored.ctScore),
        score2: int(stored.score2 ?? stored.tScore),
        ctTeam: stored.ctTeam === 'team2' ? 'team2' : 'team1',
        halfLength: clampHalf(stored.halfLength ?? halfLengths.get(serverId)),
        lastSwapTotal: typeof stored.lastSwapTotal === 'number' ? stored.lastSwapTotal : null,
        rounds: Array.isArray(stored.rounds)
          ? stored.rounds.filter((r): r is GameLogRound => !!r && (r.winner === 'ct' || r.winner === 't') && Number.isFinite(r.round))
          : [],
        kills: Array.isArray(stored.kills) ? stored.kills.slice(-KILLS_KEPT) : [],
        phase: stored.phase === 'live' || stored.phase === 'round_over' || stored.phase === 'finished' ? stored.phase : 'idle',
        started: !!stored.started,
        lastLogStamp: typeof stored.lastLogStamp === 'string' ? stored.lastLogStamp : null,
        lastLogLine: typeof stored.lastLogLine === 'string' ? stored.lastLogLine : null,
        updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : new Date().toISOString(),
      };
      states.set(serverId, state);
      if (state.lastLogStamp && (!lastStamps.has(serverId) || state.lastLogStamp > lastStamps.get(serverId)!)) {
        lastStamps.set(serverId, state.lastLogStamp);
      }
    } catch {
      return null;
    }
  }
  return states.get(serverId) ?? null;
}

function save(serverId: number, state: GameLogState) {
  const stamp = lastStamps.get(serverId);
  if (stamp && (!state.lastLogStamp || stamp > state.lastLogStamp)) state.lastLogStamp = stamp;
  state.lastLogLine = currentLines.get(serverId) ?? state.lastLogLine ?? null;
  state.updatedAt = new Date().toISOString();
  states.set(serverId, state);
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(file(serverId), JSON.stringify(state));
  } catch {
    // the live view is a convenience: never fail log ingestion because of the disk
  }
}

export function getGameLog(serverId: number): GameLogState | null {
  return load(serverId);
}

const otherTeam = (team: 'team1' | 'team2') => (team === 'team1' ? 'team2' : 'team1');
const totalRounds = (state: GameLogState) => state.score1 + state.score2;

// Which slot is on CT after `total` rounds; the same schedule as maybeSwapSides, but usable
// to rebuild history when mp_maxrounds turns out to be MR15 rather than the assumed MR12.
function ctTeamAt(total: number, half: number): 'team1' | 'team2' {
  let flips = total >= half ? 1 : 0;
  const overtimeStart = half * 2;
  if (total >= overtimeStart + 3) flips += Math.floor((total - overtimeStart) / 3);
  return flips % 2 === 0 ? 'team1' : 'team2';
}

function lastSwapAt(total: number, half: number): number | null {
  if (total < half) return null;
  const overtimeStart = half * 2;
  if (total >= overtimeStart + 3) return overtimeStart + Math.floor((total - overtimeStart) / 3) * 3;
  return half;
}

// Called when the half length becomes known later than the score lines (panel started
// mid-match, or mp_maxrounds was read after the first HTTP log replay). The round winners
// are side-based, so they are enough to put every win back on the right team.
function recomputeFromRounds(state: GameLogState) {
  const total = totalRounds(state);
  // Rounds are capped in the state; without the whole history a rebuild would be wrong
  if (state.rounds.length !== total) return;
  let score1 = 0;
  let score2 = 0;
  for (const round of [...state.rounds].sort((a, b) => a.round - b.round)) {
    const ctTeam = ctTeamAt(round.round, state.halfLength);
    const team = round.winner === 'ct' ? ctTeam : otherTeam(ctTeam);
    if (team === 'team1') score1 += 1;
    else score2 += 1;
  }
  state.score1 = score1;
  state.score2 = score2;
  // While round_over the teams are still on the sides of the round that just ended; the swap
  // happens on the next Round_Start. Keep ctTeam/lastSwapTotal in the same shape the
  // incremental path would have, or the next maybeSwapSides call would flip twice (or not at all).
  const sideIndex = state.phase === 'live' ? score1 + score2 : Math.max(0, score1 + score2 - 1);
  state.ctTeam = ctTeamAt(sideIndex, state.halfLength);
  state.lastSwapTotal = lastSwapAt(sideIndex, state.halfLength);
}

// The live route reads mp_maxrounds (24 -> 12 rounds per half, 30 -> 15) when it can. Without
// it the CS2 competitive default MR12 is assumed.
export function noteGameLogHalfLength(serverId: number, halfLength: number) {
  const half = clampHalf(halfLength);
  halfLengths.set(serverId, half);
  const state = load(serverId);
  if (state && state.halfLength !== half) {
    state.halfLength = half;
    recomputeFromRounds(state);
    save(serverId, state);
  }
}

// Regulation swap after the first half; in overtime (MR3) sides swap after every 3 rounds.
// The first overtime half continues on the second-half sides, so no swap at 24 itself.
function maybeSwapSides(state: GameLogState) {
  const rounds = totalRounds(state);
  if (state.lastSwapTotal == null) {
    if (rounds >= state.halfLength) {
      state.ctTeam = otherTeam(state.ctTeam);
      state.lastSwapTotal = state.halfLength;
    }
    return;
  }
  const overtimeStart = state.halfLength * 2;
  if (rounds >= overtimeStart + 3 && (rounds - overtimeStart) % 3 === 0 && rounds > state.lastSwapTotal) {
    state.ctTeam = otherTeam(state.ctTeam);
    state.lastSwapTotal = rounds;
  }
}

function reset(state: GameLogState, map?: string | null) {
  state.map = map ?? state.map;
  state.score1 = 0;
  state.score2 = 0;
  state.ctTeam = 'team1';
  state.lastSwapTotal = null;
  state.rounds = [];
  state.kills = [];
  state.phase = 'idle';
  state.started = false;
}

// A2S may report a workshop path while the log prints only the map name (and vice versa):
// compare the last path segment, not the raw string.
const mapKey = (map: string) => {
  const normalized = map.replace(/\\/g, '/').toLowerCase();
  return normalized.split('/').filter(Boolean).pop() ?? normalized;
};

// A2S knows the map even between rounds and right after a changelevel, before the log has
// printed a Match_Start. A different map means a new map of the series: its score starts at 0.
export function noteGameLogMap(serverId: number, map: string) {
  const state = load(serverId);
  if (!state) return;
  if (!state.map) {
    state.map = map;
    save(serverId, state);
    return;
  }
  if (mapKey(state.map) === mapKey(map)) return;
  reset(state, map);
  save(serverId, state);
}

// Source log lines may carry a live "L MM/DD/YYYY - HH:MM:SS: " or a log-file
// "MM/DD/YYYY - HH:MM:SS.mmm - " prefix, plus colour control bytes.
const clean = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/^(?:L\s+)?(?:\d{1,2}\/\d{1,2}\/\d{4} - \d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?: - |: ))?/, '')
    .trim();

// Sortable YYYYMMDDHHMMSSmmm key; enough to discard an older re-posted log tail.
const STAMP = /^(?:L\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4}) - (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?(?: - |: )/;
function logStamp(value: string): string | null {
  const match = STAMP.exec(value.replace(/^\uFEFF/, ''));
  if (!match) return null;
  const [, month, day, year, hour, minute, second, fraction] = match;
  return `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`
    + `${hour.padStart(2, '0')}${minute}${second}${(fraction ?? '').padEnd(3, '0').slice(0, 3)}`;
}

// A retried log chunk can deliver every line several times in the same moment. Two identical
// kills/round lines this close are always the same line.
function duplicate(serverId: number, body: string): boolean {
  const key = `${serverId}\u0000${body}`;
  const now = Date.now();
  const seen = lastLines.get(key);
  if (seen != null && now - seen < DEDUPE_MS) return true;
  lastLines.set(key, now);
  if (lastLines.size > 500) {
    for (const [item, at] of lastLines) if (now - at > DEDUPE_MS * 4) lastLines.delete(item);
  }
  return false;
}

const sideOf = (tag: string): GameLogSide | null => {
  const value = tag.trim().toUpperCase();
  return value === 'CT' ? 'ct' : value === 'TERRORIST' || value === 'T' ? 't' : null;
};

const MATCH_START = /^World triggered "Match_Start"(?:\s+on\s+"([^"]+)")?/i;
const GAME_OVER = /^World triggered "Game_Over"(?:\s+\(CT\s+"(\d+)"\)\s+\(T\s+"(\d+)"\))?/i;
const ROUND_START = /^World triggered "Round_Start"/i;
const ROUND_END = /^World triggered "Round_End"/i;
// Team "CT" scored "1" with "5" players
const SCORED = /^Team "(CT|TERRORIST|T)" scored "(\d+)"/i;
// "Name<2><STEAM_1:0:1><CT>" [x y z] killed "Victim<3><STEAM_1:0:2><TERRORIST>" with "ak47" (headshot)
const KILL = /^"([^"]*)<(\d+)><([^>]*)><([^>]*)>"\s+\[[^\]]*\]\s+killed\s+"([^"]*)<(\d+)><([^>]*)><([^>]*)>"\s+with\s+"([^"]+)"(?:\s+\(headshot\))?/u;
const SUICIDE = /^"([^"]*)<(\d+)><([^>]*)><([^>]*)>"\s+\[[^\]]*\]\s+committed suicide with "([^"]+)"/u;

const weaponName = (value: string) => value.replace(/^weapon_/i, '');

// Called for every line the panel receives from the game log (see chat-log.ts ingestChatLog()).
export function ingestGameLog(serverId: number, rawLine: string) {
  const stamp = logStamp(rawLine);
  // The HTTP log subscription may re-send the current log file; old lines must not be counted twice.
  const known = lastStamps.get(serverId) ?? load(serverId)?.lastLogStamp ?? null;
  if (stamp && known && stamp < known) return;

  const line = clean(rawLine);
  if (!line) return;

  // At the exact boundary the re-posted file repeats the last line already delivered.
  if (stamp && known && stamp === known) {
    const state = load(serverId);
    if (state?.lastLogLine === line) return;
  }

  currentLines.set(serverId, line);
  if (stamp && (!known || stamp > known)) lastStamps.set(serverId, stamp);
  if (duplicate(serverId, line)) return;

  const start = MATCH_START.exec(line);
  if (start) {
    const state = load(serverId) ?? fresh(serverId);
    reset(state, start[1] ?? state.map);
    state.started = true;
    state.phase = 'live';
    save(serverId, state);
    return;
  }

  const over = GAME_OVER.exec(line);
  if (over) {
    const state = load(serverId) ?? fresh(serverId);
    // The line reports the scores of the teams currently on CT and T, in that order
    if (over[1] != null && over[2] != null) {
      const ct = int(Number(over[1]));
      const t = int(Number(over[2]));
      if (state.ctTeam === 'team1') {
        state.score1 = ct;
        state.score2 = t;
      } else {
        state.score2 = ct;
        state.score1 = t;
      }
    }
    state.phase = 'finished';
    // A new match without a Match_Start line is recognised by its first scored round (below),
    // so later warmup Round_Start lines must not turn this finished match back to "live".
    state.started = false;
    save(serverId, state);
    return;
  }

  if (ROUND_START.test(line)) {
    const state = load(serverId);
    if (!state || !state.started) return;
    maybeSwapSides(state);
    state.phase = 'live';
    save(serverId, state);
    return;
  }

  if (ROUND_END.test(line)) {
    const state = load(serverId);
    if (!state || !state.started) return;
    if (state.phase !== 'round_over') {
      state.phase = 'round_over';
      save(serverId, state);
    }
    return;
  }

  const scored = SCORED.exec(line);
  if (scored) {
    const side = sideOf(scored[1]);
    if (!side) return;
    const state = load(serverId) ?? fresh(serverId);
    // The previous match ended and a new one started on the same map without Match_Start
    if (state.phase === 'finished') reset(state, state.map);
    state.started = true;
    maybeSwapSides(state);
    const team = side === 'ct' ? state.ctTeam : otherTeam(state.ctTeam);

    // Normally "1"; keep the log honest if a variant reports more.
    const won = Math.min(5, Math.max(1, int(Number(scored[2])) || 1));
    for (let i = 0; i < won; i++) {
      state.rounds.push({ round: totalRounds(state), winner: side });
      if (team === 'team1') state.score1 += 1;
      else state.score2 += 1;
    }
    state.rounds = state.rounds.slice(-ROUNDS_KEPT);
    state.phase = 'round_over';
    save(serverId, state);
    return;
  }

  const kill = KILL.exec(line);
  if (kill) {
    const state = load(serverId);
    // Kills in warmup are not part of the match feed; a kill for an already scored round is a replay
    if (!state || !state.started) return;
    const round = totalRounds(state);
    if (state.rounds.some((r) => r.round === round)) return;
    const [, attacker, , , attackerTag, victim, , , victimTag, weapon] = kill;
    state.kills.push({
      round,
      attacker: attacker.trim() || null,
      attackerSide: sideOf(attackerTag),
      victim: victim.trim(),
      victimSide: sideOf(victimTag),
      weapon: weaponName(weapon),
      headshot: /\(headshot\)/i.test(line),
    });
    state.kills = state.kills.slice(-KILLS_KEPT);
    save(serverId, state);
    return;
  }

  const suicide = SUICIDE.exec(line);
  if (suicide) {
    const state = load(serverId);
    if (!state || !state.started) return;
    const round = totalRounds(state);
    if (state.rounds.some((r) => r.round === round)) return;
    const [, victim, , , victimTag, weapon] = suicide;
    state.kills.push({
      round,
      attacker: null,
      attackerSide: null,
      victim: victim.trim(),
      victimSide: sideOf(victimTag),
      weapon: weaponName(weapon),
      headshot: false,
    });
    state.kills = state.kills.slice(-KILLS_KEPT);
    save(serverId, state);
  }
}
