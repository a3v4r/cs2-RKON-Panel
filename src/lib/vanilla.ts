// Vanilla mode: no MatchZy, RCON only. Rules go as cvars (no .cfg on the server), knife round by hand.
// No imports: used by routes and the browser.

export type ServerMode = 'matchzy' | 'vanilla';

export function controlCommands(mode: ServerMode | undefined) {
  return mode === 'vanilla'
    ? { start: 'mp_warmup_end', pause: 'mp_pause_match', unpause: 'mp_unpause_match' }
    : { start: 'css_start', pause: 'css_forcepause', unpause: 'css_forceunpause' };
}

export type RulesetId = '5v5' | '2v2';

// Close to ESL configs (MR12 / wingman MR8). Has every cvar the knife round changes,
// so applying the rules afterwards undoes it.
const RULES: Record<RulesetId, Record<string, string | number>> = {
  '5v5': {
    mp_maxrounds: 24,
    mp_overtime_enable: 1,
    mp_overtime_maxrounds: 6,
    mp_overtime_startmoney: 12500,
    mp_startmoney: 800,
    mp_maxmoney: 16000,
    mp_freezetime: 20,
    mp_roundtime: 1.92,
    mp_roundtime_defuse: 1.92,
    mp_c4timer: 40,
    mp_buytime: 20,
    mp_team_timeout_max: 3,
    mp_team_timeout_time: 30,
  },
  '2v2': {
    mp_maxrounds: 16,
    mp_overtime_enable: 1,
    mp_overtime_maxrounds: 6,
    mp_overtime_startmoney: 10000,
    mp_startmoney: 800,
    mp_maxmoney: 16000,
    mp_freezetime: 10,
    mp_roundtime: 1.5,
    mp_roundtime_defuse: 1.5,
    mp_c4timer: 40,
    mp_buytime: 15,
    mp_team_timeout_max: 2,
    mp_team_timeout_time: 30,
  },
};

const COMMON: Record<string, string | number> = {
  mp_halftime: 1,
  mp_match_can_clinch: 1,
  mp_friendlyfire: 1,
  mp_autokick: 0,
  mp_autoteambalance: 0,
  mp_limitteams: 0,
  mp_buy_anywhere: 0,
  mp_free_armor: 0,
  mp_give_player_c4: 1,
  mp_death_drop_gun: 1,
  mp_ct_default_secondary: 'weapon_hkp2000',
  mp_t_default_secondary: 'weapon_glock',
  // round backups for rollback (mp_backup_restore_load_file)
  mp_backup_round_auto: 1,
};

// Knife only: no pistols, no money, no bomb, armor for free
const KNIFE: Record<string, string | number> = {
  mp_ct_default_secondary: '',
  mp_t_default_secondary: '',
  mp_free_armor: 1,
  mp_give_player_c4: 0,
  mp_startmoney: 0,
  mp_maxmoney: 0,
};

const cvars = (values: Record<string, string | number>) =>
  Object.entries(values).map(([name, value]) => (typeof value === 'string' ? `${name} "${value}"` : `${name} ${value}`));

const rules = (id: RulesetId) => cvars({ ...COMMON, ...RULES[id] });

export const vanillaSteps = {
  warmup: (id: RulesetId) => [...rules(id), 'mp_warmup_pausetimer 1', 'mp_warmup_start'],
  knife: (id: RulesetId) => [
    ...rules(id), ...cvars(KNIFE),
    'mp_warmup_pausetimer 0', 'mp_warmup_end', 'mp_restartgame 1',
    'say Ножевой раунд / Knife round',
  ],
  // from warmup or after the knife round (swap = knife winners take the other side)
  live: (id: RulesetId, swap: boolean) => [
    ...rules(id),
    ...(swap ? ['mp_swapteams'] : []),
    'mp_unpause_match', 'mp_warmup_pausetimer 0', 'mp_warmup_end', 'mp_restartgame 1',
    'say Матч начался, LIVE / Match is LIVE',
  ],
};

// console line length is limited, so long cvar lists go in several RCON commands
export function batchCommands(commands: string[], maxLength = 400): string[] {
  const batches: string[] = [];
  let current = '';
  for (const command of commands) {
    const next = current ? `${current}; ${command}` : command;
    if (current && next.length > maxLength) {
      batches.push(current);
      current = command;
    } else {
      current = next;
    }
  }
  if (current) batches.push(current);
  return batches;
}

// mp_backup_restore_list_files: backup_round05.txt = state at the start of round 6
export function parseBackupFiles(output: string): { file: string; round: number }[] {
  const found = new Map<string, number>();
  for (const match of output.matchAll(/([\w.-]*_round(\d+)\.txt)/g)) found.set(match[1], Number(match[2]));
  return [...found].map(([file, round]) => ({ file, round })).sort((a, b) => b.round - a.round);
}

export const backupFileName = (playedRounds: number) => `backup_round${String(playedRounds).padStart(2, '0')}.txt`;

// css_roundknife replies with the new state ("Ножевой раунд теперь Включен!" / "Knife round is now Enabled!",
// with colour codes). The state cannot be read without toggling.
export function parseKnifeReply(output: string): boolean | null {
  const text = output.replace(/[\x00-\x1f]/g, ' ');
  if (/выключен|disabled/i.test(text)) return false;
  if (/включен|enabled/i.test(text)) return true;
  return null;
}
