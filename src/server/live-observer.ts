import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';
import type { RoundBackup } from './matchzy-backups';

// MatchZy tells the panel about a match in two ways:
//  - get5_status over RCON: state, scores, sides, maps. Works for every match.
//  - remote log events (see live.ts): player stats, kills, round reasons. Only for matches launched from the panel.
// This module rebuilds what can be learnt from the status poll alone: round winners and map results.
// It lets the Match tab fill in even when a match was started in the game console (or the events cannot reach us).

export interface ObservedRound {
  round: number;
  winner: 'team1' | 'team2';
  // Side the winner played on in that round: 'ct' | 't'
  side: string;
}

export interface ObservedMap {
  mapNumber: number;
  mapName: string | null;
  team1Score: number;
  team2Score: number;
  winner: 'team1' | 'team2' | null;
}

export interface ObservedTeam {
  name: string;
  score: number;
  series: number;
  side: string;
}

export interface MatchObservation {
  matchid: number | null;
  mapNumber: number | null;
  mapName: string | null;
  team1: ObservedTeam;
  team2: ObservedTeam;
  rounds: ObservedRound[];
  maps: ObservedMap[];
  // Last poll: tells a finished round from a restored one and gives the round its side
  score1: number;
  score2: number;
  side1: string;
  side2: string;
  // "<matchid>:<mapNumber>" once the round history was filled from the backups on the game server
  seededFor: string | null;
  updatedAt: string;
}

// The part of get5_status this module understands (see MatchZy/G5API.cs)
export interface MatchStatus {
  gamestate?: string | null;
  matchid?: number | null;
  map_number?: number | null;
  maps?: string[] | null;
  team1?: {
    name?: string;
    side?: string;
    current_map_score?: number;
    series_score?: number;
  } | null;
  team2?: {
    name?: string;
    side?: string;
    current_map_score?: number;
    series_score?: number;
  } | null;
}

const globalForObserved = globalThis as unknown as { matchObservations?: Map<number, MatchObservation> };
const observations = (globalForObserved.matchObservations ??= new Map<number, MatchObservation>());
const file = (serverId: number) => path.join(dataDir(), `match-observed-${serverId}.json`);

const int = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);
const emptyTeam = (): ObservedTeam => ({ name: '', score: 0, series: 0, side: '' });

function load(serverId: number): MatchObservation | null {
  if (!observations.has(serverId)) {
    try {
      const stored = JSON.parse(fs.readFileSync(file(serverId), 'utf8')) as MatchObservation;
      observations.set(serverId, {
        ...stored,
        team1: stored.team1 ?? emptyTeam(),
        team2: stored.team2 ?? emptyTeam(),
        rounds: Array.isArray(stored.rounds) ? stored.rounds : [],
        maps: Array.isArray(stored.maps) ? stored.maps : [],
        score1: int(stored.score1),
        score2: int(stored.score2),
        side1: stored.side1 ?? '',
        side2: stored.side2 ?? '',
        seededFor: stored.seededFor ?? null,
      });
    } catch {
      return null;
    }
  }
  return observations.get(serverId) ?? null;
}

function save(serverId: number, state: MatchObservation) {
  state.updatedAt = new Date().toISOString();
  observations.set(serverId, state);
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(file(serverId), JSON.stringify(state));
  } catch {
    // observations are a convenience: never fail the live view because of the disk
  }
}

export function getObservation(serverId: number): MatchObservation | null {
  return load(serverId);
}

const mapNameOf = (status: MatchStatus, mapNumber: number | null) =>
  mapNumber != null && Array.isArray(status.maps) ? status.maps[mapNumber] ?? null : null;

function recordMap(maps: ObservedMap[], mapNumber: number | null, mapName: string | null, score1: number, score2: number): ObservedMap[] {
  const number = mapNumber ?? 0;
  const result: ObservedMap = {
    mapNumber: number,
    mapName,
    team1Score: score1,
    team2Score: score2,
    winner: score1 > score2 ? 'team1' : score2 > score1 ? 'team2' : null,
  };
  return [...maps.filter((m) => m.mapNumber !== number), result].sort((a, b) => a.mapNumber - b.mapNumber);
}

function addRound(state: MatchObservation, round: number, winner: 'team1' | 'team2', side: string) {
  state.rounds = state.rounds.filter((r) => r.round !== round);
  state.rounds.push({ round, winner, side: side === 'ct' || side === 't' ? side : '' });
  state.rounds.sort((a, b) => a.round - b.round);
}

// Called by the live route on every poll. The first poll only remembers the score; round winners can be told
// only from the next polls (score went up) or a restore (score went down).
export function observeMatch(serverId: number, status: MatchStatus | null, mapName: string | null): MatchObservation | null {
  if (!status || status.gamestate === 'none' || !status.team1 || !status.team2) return load(serverId);

  const matchid = typeof status.matchid === 'number' && status.matchid >= 0 ? status.matchid : null;
  const mapNumber = typeof status.map_number === 'number' ? status.map_number : null;
  const score1 = int(status.team1.current_map_score);
  const score2 = int(status.team2.current_map_score);
  const side1 = status.team1.side === 'ct' || status.team1.side === 't' ? status.team1.side : '';
  const side2 = status.team2.side === 'ct' || status.team2.side === 't' ? status.team2.side : '';
  const name1 = status.team1.name ?? '';
  const name2 = status.team2.name ?? '';

  let state = load(serverId);
  const matchChanged = !!state && state.matchid != null && matchid != null && state.matchid !== matchid;
  // The map list order is more reliable than A2S around a map change, when the two polls may see different maps
  const resolvedMapName = mapNameOf(status, mapNumber) ?? mapName;
  if (!state || matchChanged) {
    state = {
      matchid,
      mapNumber,
      mapName: resolvedMapName,
      team1: { name: name1, score: score1, series: int(status.team1.series_score), side: side1 },
      team2: { name: name2, score: score2, series: int(status.team2.series_score), side: side2 },
      rounds: [],
      maps: [],
      score1,
      score2,
      side1,
      side2,
      seededFor: null,
      updatedAt: new Date().toISOString(),
    };
    save(serverId, state);
    return state;
  }

  // A new map in the series: keep the final score of the previous one
  if (mapNumber != null && state.mapNumber != null && mapNumber !== state.mapNumber) {
    if (state.score1 + state.score2 > 0) {
      state.maps = recordMap(state.maps, state.mapNumber, state.mapName, state.score1, state.score2);
    }
    state.mapNumber = mapNumber;
    state.rounds = [];
    state.seededFor = null;
  } else if (state.mapNumber == null && mapNumber != null) {
    state.mapNumber = mapNumber;
  }
  state.mapName = resolvedMapName ?? state.mapName;

  const lastSum = state.score1 + state.score2;
  const sum = score1 + score2;
  if (sum < lastSum) {
    // Round restore: forget the rounds that no longer count, and let the backups refill the history next poll
    state.rounds = state.rounds.filter((r) => r.round < sum);
    state.seededFor = null;
  } else if (sum > lastSum) {
    const won1 = score1 - state.score1;
    const won2 = score2 - state.score2;
    if (won1 >= 0 && won2 >= 0) {
      if (won1 + won2 === 1) {
        addRound(state, lastSum, won1 > 0 ? 'team1' : 'team2', won1 > 0 ? state.side1 : state.side2);
      } else if (won1 === 0 || won2 === 0) {
        // The panel was not looking for several rounds, but only one team won them - still certain
        const winner = won1 > 0 ? 'team1' : 'team2';
        const side = won1 > 0 ? state.side1 : state.side2;
        for (let round = lastSum; round < sum; round++) addRound(state, round, winner, side);
      }
      // Both teams won while the panel was not looking: the order is unknown, so no rounds are invented
    }
  }

  state.matchid = matchid ?? state.matchid;
  state.team1 = {
    name: name1 || state.team1.name,
    score: score1,
    series: int(status.team1.series_score),
    side: side1 || state.team1.side,
  };
  state.team2 = {
    name: name2 || state.team2.name,
    score: score2,
    series: int(status.team2.series_score),
    side: side2 || state.team2.side,
  };
  state.score1 = score1;
  state.score2 = score2;
  state.side1 = side1 || state.side1;
  state.side2 = side2 || state.side2;

  // After the last round of a map MatchZy stays in post_game until the next map loads: show the result now
  if (status.gamestate === 'post_game' && sum > 0) {
    state.maps = recordMap(state.maps, state.mapNumber, state.mapName, score1, score2);
  }

  save(serverId, state);
  return state;
}
