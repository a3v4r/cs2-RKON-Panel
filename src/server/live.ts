import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';

// Live match state built from MatchZy events (remote log), one per game server.
// Saved to disk so a panel restart in the middle of a match keeps the stats.

export interface PlayerStats {
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshot_kills: number;
  rounds_played: number;
  utility_damage?: number;
  enemies_flashed?: number;
  flash_assists?: number;
  first_kills_t?: number;
  first_kills_ct?: number;
  '1v1'?: number;
  '1v2'?: number;
  '1v3'?: number;
  '1v4'?: number;
  '1v5'?: number;
  mvp?: number;
}

export interface LivePlayer {
  steamid: string;
  name: string;
  stats: PlayerStats;
}

export interface LiveTeam {
  name: string;
  score: number;
  scoreCt: number;
  scoreT: number;
  seriesScore: number;
  side: string;
  players: LivePlayer[];
}

export interface LiveRound {
  round: number;
  winner: 'team1' | 'team2';
  side: string;
  reason: number;
}

export interface LiveKill {
  round: number;
  attacker: string | null;
  attackerTeam: 'team1' | 'team2' | null;
  victim: string;
  victimTeam: 'team1' | 'team2' | null;
  weapon: string;
  headshot: boolean;
}

export interface LiveMapResult {
  mapNumber: number;
  mapName: string | null;
  team1Score: number;
  team2Score: number;
  winner: 'team1' | 'team2' | null;
}

export interface LiveState {
  matchid: number | null;
  numMaps: number | null;
  mapNumber: number;
  mapName: string | null;
  team1: LiveTeam;
  team2: LiveTeam;
  rounds: LiveRound[];
  kills: LiveKill[];
  maps: LiveMapResult[];
  finished: boolean;
  // Which team plays CT on the current half, learned from round results (kill feed colours)
  ctTeam: 'team1' | 'team2' | null;
  updatedAt: string;
}

const KILLS_KEPT = 30;

const emptyTeam = (name = ''): LiveTeam => ({ name, score: 0, scoreCt: 0, scoreT: 0, seriesScore: 0, side: '', players: [] });

const fresh = (): LiveState => ({
  matchid: null,
  numMaps: null,
  mapNumber: 0,
  mapName: null,
  team1: emptyTeam(),
  team2: emptyTeam(),
  rounds: [],
  kills: [],
  maps: [],
  finished: false,
  ctTeam: null,
  updatedAt: new Date().toISOString(),
});

const globalForLive = globalThis as unknown as { liveStates?: Map<number, LiveState> };
const states = (globalForLive.liveStates ??= new Map<number, LiveState>());
const file = (serverId: number) => path.join(dataDir(), `live-${serverId}.json`);

export function getLive(serverId: number): LiveState | null {
  if (!states.has(serverId)) {
    try {
      states.set(serverId, JSON.parse(fs.readFileSync(file(serverId), 'utf8')));
    } catch {
      return null;
    }
  }
  return states.get(serverId) ?? null;
}

function save(serverId: number, state: LiveState) {
  state.updatedAt = new Date().toISOString();
  states.set(serverId, state);
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(file(serverId), JSON.stringify(state));
  } catch {
    // stats are a convenience: never fail the event
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- MatchZy event payloads */
function readTeam(team: any, previous: LiveTeam): LiveTeam {
  if (!team) return previous;
  return {
    name: team.name ?? previous.name,
    score: team.score ?? previous.score,
    scoreCt: team.score_ct ?? previous.scoreCt,
    scoreT: team.score_t ?? previous.scoreT,
    seriesScore: team.series_score ?? previous.seriesScore,
    side: previous.side, // not in MatchZy stats; the live route takes it from get5_status
    players: Array.isArray(team.players)
      ? team.players.map((p: any) => ({ steamid: String(p.steamid ?? ''), name: String(p.name ?? ''), stats: p.stats ?? {} }))
      : previous.players,
  };
}

// Winner.side is the game's team number: "3" = CT, "2" = T
const sideName = (side: unknown) => (String(side) === '3' ? 'ct' : String(side) === '2' ? 't' : '');

const otherTeam = (team: 'team1' | 'team2') => (team === 'team1' ? 'team2' : 'team1');

function teamOf(state: LiveState, player: { steamid?: string; side?: string } | null | undefined): 'team1' | 'team2' | null {
  if (!player) return null;
  if (player.steamid && state.team1.players.some((p) => p.steamid === player.steamid)) return 'team1';
  if (player.steamid && state.team2.players.some((p) => p.steamid === player.steamid)) return 'team2';
  if (state.ctTeam && (player.side === 'ct' || player.side === 't')) {
    return player.side === 'ct' ? state.ctTeam : otherTeam(state.ctTeam);
  }
  return null;
}

export function applyEvent(serverId: number, event: any) {
  const name: string = event?.event;
  if (!name) return;
  let state = getLive(serverId) ?? fresh();

  // A different match id means a new match on this server
  if (event.matchid != null && state.matchid != null && event.matchid !== state.matchid) state = fresh();

  switch (name) {
    case 'series_start':
      state = fresh();
      state.matchid = event.matchid ?? null;
      state.numMaps = event.num_maps ?? null;
      state.team1 = emptyTeam(event.team1?.name ?? '');
      state.team2 = emptyTeam(event.team2?.name ?? '');
      break;
    case 'going_live':
      state.matchid = event.matchid ?? state.matchid;
      state.mapNumber = event.map_number ?? state.mapNumber;
      state.rounds = [];
      state.kills = [];
      state.team1 = { ...state.team1, score: 0, scoreCt: 0, scoreT: 0 };
      state.team2 = { ...state.team2, score: 0, scoreCt: 0, scoreT: 0 };
      break;
    case 'round_end':
      state.matchid = event.matchid ?? state.matchid;
      state.mapNumber = event.map_number ?? state.mapNumber;
      state.team1 = readTeam(event.team1, state.team1);
      state.team2 = readTeam(event.team2, state.team2);
      if (event.winner?.team === 'team1' || event.winner?.team === 'team2') {
        state.rounds = state.rounds.filter((r) => r.round !== event.round_number);
        const side = sideName(event.winner.side);
        state.rounds.push({ round: event.round_number, winner: event.winner.team, side, reason: event.reason ?? 0 });
        if (side) state.ctTeam = side === 'ct' ? event.winner.team : otherTeam(event.winner.team);
      }
      break;
    case 'player_death':
      if (!event.player) break;
      state.kills.push({
        round: event.round_number ?? 0,
        attacker: event.attacker?.name ?? null,
        attackerTeam: teamOf(state, event.attacker),
        victim: event.player.name ?? '',
        victimTeam: teamOf(state, event.player),
        weapon: event.weapon?.name ?? (event.bomb ? 'bomb' : ''),
        headshot: !!event.headshot,
      });
      state.kills = state.kills.slice(-KILLS_KEPT);
      break;
    case 'backup_loaded':
      // A round was restored: drop the rounds and kills after it
      state.rounds = state.rounds.filter((r) => r.round < (event.round_number ?? 0));
      state.kills = state.kills.filter((k) => k.round < (event.round_number ?? 0));
      break;
    case 'map_result':
      state.team1 = readTeam(event.team1, state.team1);
      state.team2 = readTeam(event.team2, state.team2);
      state.maps = state.maps.filter((m) => m.mapNumber !== event.map_number);
      state.maps.push({
        mapNumber: event.map_number ?? state.mapNumber,
        mapName: state.mapName,
        team1Score: state.team1.score,
        team2Score: state.team2.score,
        winner: event.winner?.team ?? null,
      });
      break;
    case 'series_end':
      state.finished = true;
      if (event.team1_series_score != null) state.team1.seriesScore = event.team1_series_score;
      if (event.team2_series_score != null) state.team2.seriesScore = event.team2_series_score;
      break;
    default:
      return; // other events do not change what the panel shows
  }
  save(serverId, state);
}

// The map name is not in the events; the live route fills it from A2S
export function setMapName(serverId: number, mapName: string) {
  const state = getLive(serverId);
  if (state && state.mapName !== mapName) {
    state.mapName = mapName;
    save(serverId, state);
  }
}
