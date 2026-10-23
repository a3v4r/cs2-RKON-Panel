// MatchZy round backups. A backup is written at the start of every round as
// matchzy_<matchid>_<mapNumber>_round<NN>.json, so backup NN holds the score before round NN + 1 was played.
// Consecutive backups therefore tell who won each finished round - without waiting for the round event.

export interface RoundBackup {
  round: number;
  time: string;
  team1Score: number;
  team2Score: number;
}

// One line of `matchzy_listbackups`:
// "<path>\matchzy_<matchid>_<map>_round<NN>.json <yyyy-mm-dd hh:mm:ss> <team1> <team2> <map> <score1> <score2>"
const BACKUP_LINE = /matchzy_(\d+)_(\d+)_round(\d+)\.json\s+\d{4}-\d\d-\d\d (\d\d:\d\d):\d\d\s.*\s(\d+)\s+(\d+)\s*$/;

// One entry per round (replaying a round overwrites its file). Rounds above maxRound are left over from before a
// restore and must not be shown.
export function parseBackupList(output: string, matchid: number, mapNumber: number, maxRound = Infinity): RoundBackup[] {
  const byRound = new Map<number, RoundBackup>();
  for (const line of output.split('\n')) {
    const m = BACKUP_LINE.exec(line.trim());
    if (!m || Number(m[1]) !== matchid || Number(m[2]) !== mapNumber) continue;
    const round = Number(m[3]);
    if (round > maxRound) continue;
    byRound.set(round, { round, time: m[4], team1Score: Number(m[5]), team2Score: Number(m[6]) });
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}
