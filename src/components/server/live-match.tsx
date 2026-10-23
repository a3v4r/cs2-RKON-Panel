"use client";

import React from 'react';
import { Activity, Crosshair, Skull, Bomb, ShieldCheck, Timer, Flag, Wifi, WifiOff, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/use-polling';
import { RoundRestore } from '@/components/server/round-restore';

interface Stats {
  kills?: number;
  deaths?: number;
  assists?: number;
  damage?: number;
  headshot_kills?: number;
  rounds_played?: number;
  kast?: number;
  '1v1'?: number;
  '1v2'?: number;
  '1v3'?: number;
  '1v4'?: number;
  '1v5'?: number;
}

interface LiveTeam {
  name: string;
  score: number;
  seriesScore: number;
  side?: string;
  players: { steamid: string; name: string; stats: Stats }[];
}

interface LiveRound {
  round: number;
  winner: 'team1' | 'team2';
  side: string;
  // MatchZy events know how the round ended; polled rounds do not
  reason?: number;
}

interface LiveMapResult {
  mapNumber: number;
  mapName: string | null;
  team1Score: number;
  team2Score: number;
  winner: 'team1' | 'team2' | null;
}

interface StatusTeam {
  name: string;
  score: number;
  series: number;
  side: string;
  connected: number | null;
  ready: boolean;
}

// Match state reconstructed from the game's own log (game-log.ts): no MatchZy needed.
// Team names are not in those lines, so the fallback view uses CT/T.
interface GenericRound {
  round: number;
  winner: 'ct' | 't';
}

interface GenericKill {
  round: number;
  attacker: string | null;
  attackerSide: 'ct' | 't' | null;
  victim: string;
  victimSide: 'ct' | 't' | null;
  weapon: string;
  headshot: boolean;
}

interface GenericPlayer {
  name: string;
  score: number;
  duration: number;
}

interface GenericMatchData {
  map: string | null;
  ctScore: number;
  tScore: number;
  // Regulation rounds per half: 12 for MR12, 15 for MR15
  halfLength: number;
  rounds: GenericRound[];
  kills: GenericKill[];
  phase: 'idle' | 'live' | 'round_over' | 'finished';
  updatedAt: string;
  // Age of the last line from the game log, in seconds (the poll itself stays fresh)
  logAgeSeconds: number | null;
  players: GenericPlayer[] | null;
}

interface LiveData {
  receivedAt: number;
  online: boolean;
  map: string | null;
  status: null | {
    state: string;
    paused: boolean;
    matchid: number | null;
    mapNumber: number | null;
    numMaps: number | null;
    maps: string[] | null;
    round: number;
    clock: { phase: string; seconds: number } | null;
    team1: StatusTeam | null;
    team2: StatusTeam | null;
  };
  // MatchZy events: player stats, rounds with reasons, kills. Only for matches launched from the panel
  live: null | {
    matchid: number | null;
    numMaps: number | null;
    mapNumber: number;
    mapName: string | null;
    team1: LiveTeam;
    team2: LiveTeam;
    rounds: LiveRound[];
    kills: { round: number; attacker: string | null; attackerTeam: 'team1' | 'team2' | null; victim: string; victimTeam: 'team1' | 'team2' | null; weapon: string; headshot: boolean }[];
    maps: LiveMapResult[];
    finished: boolean;
    updatedAt?: string;
  };
  // Rounds and map results rebuilt from get5_status polls: works for any match, no events needed
  observed: null | {
    matchid: number | null;
    mapNumber: number | null;
    mapName: string | null;
    team1: { name: string; score: number; series: number; side: string };
    team2: { name: string; score: number; series: number; side: string };
    rounds: LiveRound[];
    maps: LiveMapResult[];
    updatedAt?: string;
  };
  // Score/rounds/kills from the CS2 log stream, map and players from A2S. Used when MatchZy is not running
  generic: GenericMatchData | null;
}

const STATE_LABELS: Record<string, string> = {
  pre_veto: 'Ожидание вето',
  veto: 'Вето',
  warmup: 'Разминка',
  knife: 'Ножевой раунд',
  waiting_for_knife_decision: 'Выбор стороны',
  going_live: 'Старт',
  pending_restore: 'Откат раунда',
  live: 'Идёт игра',
  post_game: 'Карта окончена',
};

// Before live the teams are still gathering: connected/ready counts are the useful part
const PRE_LIVE = new Set(['pre_veto', 'veto', 'warmup', 'knife', 'waiting_for_knife_decision', 'going_live']);

// RoundEndReason (CounterStrikeSharp): 1 bomb exploded, 7 defused, 8/9 team eliminated, 12 time ran out, 17/18 surrender
function ReasonIcon({ reason }: { reason: number }) {
  if (reason === 1) return <Bomb size={10} />;
  if (reason === 7) return <ShieldCheck size={10} />;
  if (reason === 12) return <Timer size={10} />;
  if (reason === 17 || reason === 18) return <Flag size={10} />;
  return <Skull size={10} />;
}

const reasonText = (reason: number) =>
  reason === 1 ? 'бомба взорвана' : reason === 7 ? 'бомба разминирована' : reason === 12 ? 'время вышло'
    : reason === 17 || reason === 18 ? 'сдача' : 'все убиты';

const weaponName = (weapon: string) => (weapon === 'planted_c4' || weapon === 'bomb' ? 'C4' : weapon);

// Team colours stay the same all match; the side (CT/T) is shown separately
const TEAM_TEXT = { team1: 'text-sky-400', team2: 'text-amber-400' } as const;
const TEAM_BG = { team1: 'bg-sky-500/70', team2: 'bg-amber-500/70' } as const;
// Generic (log-based) view has sides instead of team names
const SIDE_TEXT = { ct: 'text-sky-400', t: 'text-amber-400' } as const;
const SIDE_BG = { ct: 'bg-sky-500/70', t: 'bg-amber-500/70' } as const;

const playersLabel = (count: number) => {
  const ten = count % 10;
  const hundred = count % 100;
  if (ten === 1 && hundred !== 11) return 'игрок';
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return 'игрока';
  return 'игроков';
};

export function LiveMatch({ serverId, serverMode }: { serverId: number; serverMode: 'matchzy' | 'vanilla' }) {
  const [data, setData] = React.useState<LiveData | null>(null);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      const fresh = await api<LiveData>(`/api/servers/${serverId}/live`);
      setData({ ...fresh, receivedAt: Date.now() });
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [serverId]);

  // Two seconds: a round end, a pause or a side swap shows up almost immediately
  usePolling(load, 2000);

  if (!data) return <div className="p-6 text-muted-foreground">{error || 'Загрузка...'}</div>;

  const { status, live, observed } = data;
  const teams = status?.team1 && status.team2
    ? { team1: status.team1, team2: status.team2 }
    : live
      ? {
          team1: { name: live.team1.name, score: live.team1.score, series: live.team1.seriesScore, side: live.team1.side ?? '', connected: null, ready: false },
          team2: { name: live.team2.name, score: live.team2.score, series: live.team2.seriesScore, side: live.team2.side ?? '', connected: null, ready: false },
        }
      : observed
        ? {
            team1: { ...observed.team1, connected: null, ready: false },
            team2: { ...observed.team2, connected: null, ready: false },
          }
        : null;
  const t1 = teams?.team1;
  const t2 = teams?.team2;

  const stateLabel = status
    ? (status.paused ? 'ПАУЗА' : STATE_LABELS[status.state] ?? status.state)
    : live?.finished ? 'Матч завершён'
      : data.online ? 'Матч не загружен' : 'Сервер не отвечает';
  const stateTone = status?.paused
    ? 'bg-amber-500/15 text-amber-400'
    : status?.state === 'live'
      ? 'bg-emerald-500/15 text-emerald-400'
      : 'bg-white/10 text-muted-foreground';

  const mapName = data.map ?? observed?.mapName ?? live?.mapName ?? null;
  const mapNumber = typeof status?.mapNumber === 'number' ? status.mapNumber : null;
  const roundRounds = live?.rounds.length ? live.rounds : observed?.rounds ?? [];
  const roundsFromServer = !live?.rounds.length && !!observed?.rounds.length;
  const mapResults = live?.maps.length ? live.maps : observed?.maps ?? [];
  const preLive = !!status && PRE_LIVE.has(status.state);

  const generic = data.generic;
  const genericRunning = !!generic && (generic.phase === 'live' || generic.phase === 'round_over');
  const matchzyStamp = Math.max(
    Date.parse(live?.updatedAt ?? '') || 0,
    Date.parse(observed?.updatedAt ?? '') || 0,
  );
  // A MatchZy match that is still running keeps its richer view even if get5_status failed.
  // A state left "running" by a crashed server goes stale and must not hide today's match.
  const matchzyRunning = !!live && !live.finished && matchzyStamp > 0
    && Date.now() - matchzyStamp < 30 * 60_000;
  const useGeneric = !status && (
    serverMode === 'vanilla'
    || !matchzyStamp
    || (genericRunning && !matchzyRunning)
  );

  if (useGeneric) {
    return (
      <div className="p-3 md:p-6 space-y-4 animate-in fade-in duration-500">
        {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
        {!data.online && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Игровой сервер не отвечает по RCON/A2S. Показаны последние полученные данные; опрос продолжится сам.
          </div>
        )}
        <GenericMatch data={data} generic={generic} />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 animate-in fade-in duration-500">
      {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
      {!data.online && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Игровой сервер не отвечает по RCON/A2S. Показаны последние полученные данные; опрос продолжится сам.
        </div>
      )}

      {/* Scoreboard: state, map, score, timer - all straight from get5_status and A2S */}
      <section className="rounded-xl border border-border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Activity size={14} className="text-primary" />
            <span>{mapName ?? '—'}</span>
            {mapNumber != null && (
              <span>• карта {mapNumber + 1}{status?.numMaps ? ` из ${status.numMaps}` : ''}</span>
            )}
            {status && status.round >= 0 && <span>• раунд {status.round + 1}</span>}
          </span>
          <span className="flex items-center gap-2">
            <UpdateAge receivedAt={data.receivedAt} online={data.online} />
            <span className={cn('rounded-full px-2 py-0.5 font-bold uppercase', stateTone)}>{stateLabel}</span>
          </span>
        </div>
        {t1 && t2 ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamHeader team={t1} teamKey="team1" showReady={preLive} />
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold tabular-nums">{t1.score} : {t2.score}</div>
              <div className="text-xs text-muted-foreground">серия {t1.series}:{t2.series}</div>
              {status?.clock && <RoundClock clock={status.clock} paused={status.paused} receivedAt={data.receivedAt} />}
            </div>
            <TeamHeader team={t2} teamKey="team2" showReady={preLive} align="right" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {data.online
              ? 'Матч не загружен. Запустите его во вкладке «Запуск» (или в консоли сервера) - счёт появится здесь сам.'
              : 'Нет связи с игровым сервером: показать счёт не из чего.'}
          </p>
        )}
      </section>

      {status?.state === 'live' && <RoundRestore serverId={serverId} paused={status.paused} round={status.round} onDone={load} />}

      {roundRounds.length > 0 && <RoundStrip rounds={roundRounds} note={roundsFromServer ? 'по опросу сервера' : undefined} />}

      {(mapResults.length > 0 || status?.maps?.length) && (
        <SeriesMaps
          maps={status?.maps ?? null}
          numMaps={status?.numMaps ?? null}
          currentMapNumber={mapNumber}
          currentLive={status?.state === 'live'}
          currentScores={status?.team1 && status.team2 ? { team1Score: status.team1.score, team2Score: status.team2.score } : null}
          results={mapResults}
        />
      )}

      {!live && (
        <p className="text-xs text-muted-foreground">
          {data.online
            ? 'Подробная статистика игроков (K/D/A, ADR, HS%, клатчи) и лента убийств приходят событиями MatchZy - для матчей, запущенных из панели. Счёт, раунды и карты выше идут с игрового сервера.'
            : 'Статистика появится, когда сервер снова ответит.'}
        </p>
      )}

      {live && (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <PlayersTable team={live.team1} teamKey="team1" />
            <PlayersTable team={live.team2} teamKey="team2" />
          </div>

          {live.kills.length > 0 && (
            <section className="rounded-xl border border-border p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Crosshair size={14} className="text-primary" /> Последние убийства</h3>
              <div className="space-y-1 text-sm">
                {[...live.kills].reverse().slice(0, 10).map((k, i) => (
                  <div key={i} className="flex items-center gap-2 min-w-0">
                    <span className="w-8 shrink-0 text-xs text-muted-foreground">R{k.round + 1}</span>
                    <span className={cn('truncate', k.attackerTeam ? TEAM_TEXT[k.attackerTeam] : 'text-muted-foreground')}>{k.attacker ?? '—'}</span>
                    <span className="shrink-0 rounded bg-white/5 px-1.5 text-xs text-muted-foreground">{weaponName(k.weapon)}{k.headshot ? ' • HS' : ''}</span>
                    <span className={cn('truncate', k.victimTeam ? TEAM_TEXT[k.victimTeam] : '')}>{k.victim}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// Fallback for matches MatchZy does not run: score, rounds and kills come from the game log,
// map and player list from A2S. There are no team names, so the scoreboard is CT/T.
function GenericMatch({ data, generic }: { data: LiveData; generic: GenericMatchData | null }) {
  const rounds = generic?.rounds ?? [];
  const kills = generic?.kills ?? [];
  const players = generic?.players ?? null;
  const ctScore = generic?.ctScore ?? 0;
  const tScore = generic?.tScore ?? 0;
  const phase = generic?.phase ?? 'idle';
  const mapName = data.map ?? generic?.map ?? null;
  const hasScore = !!generic && (phase === 'live' || phase === 'round_over' || phase === 'finished');
  const roundNumber = phase === 'live' ? ctScore + tScore + 1 : ctScore + tScore;
  const stateLabel = phase === 'live' ? 'Идёт игра'
    : phase === 'round_over' ? 'Конец раунда'
      : phase === 'finished' ? 'Матч завершён' : 'Ожидание матча';
  const stateTone = phase === 'live' ? 'bg-emerald-500/15 text-emerald-400'
    : phase === 'round_over' ? 'bg-sky-500/15 text-sky-300' : 'bg-white/10 text-muted-foreground';

  return (
    <>
      <section className="rounded-xl border border-border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Activity size={14} className="text-primary" />
            <span>{mapName ?? '—'}</span>
            {phase === 'live' && <span>• раунд {roundNumber}</span>}
            {phase === 'round_over' && <span>• раунд {roundNumber} завершён</span>}
            {phase === 'finished' && roundNumber > 0 && <span>• всего раундов {roundNumber}</span>}
          </span>
          <span className="flex items-center gap-2">
            {(phase === 'live' || phase === 'round_over') && generic?.logAgeSeconds != null && generic.logAgeSeconds > 90 && (
              <span className="text-amber-400" title="В логе сервера давно нет новых строк. Проверьте сбор логов на вкладке «Чат».">
                лог: {generic.logAgeSeconds < 60 ? `${generic.logAgeSeconds} с` : `${Math.floor(generic.logAgeSeconds / 60)} мин`} назад
              </span>
            )}
            <UpdateAge receivedAt={data.receivedAt} online={data.online} />
            <span className={cn('rounded-full px-2 py-0.5 font-bold uppercase', stateTone)}>{stateLabel}</span>
          </span>
        </div>

        {hasScore ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div>
              <div className="text-base md:text-xl font-bold text-sky-400">CT</div>
              <div className="text-xs text-muted-foreground">контр-террористы</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold tabular-nums">{ctScore} : {tScore}</div>
              <div className="text-xs text-muted-foreground">счёт по текущим сторонам (из лога)</div>
            </div>
            <div className="text-right">
              <div className="text-base md:text-xl font-bold text-amber-400">T</div>
              <div className="text-xs text-muted-foreground">террористы</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {data.online
              ? (mapName
                  ? 'Матч ещё не начался: счёт появится из лога сервера, как только закончится первый раунд.'
                  : 'Матч ещё не начался, и панель пока не получила данные от игрового сервера. Счёт появится автоматически.')
              : 'Нет связи с игровым сервером: показать счёт не из чего.'}
          </p>
        )}
      </section>

      {rounds.length > 0 && <GenericRoundStrip rounds={rounds} halfLength={generic?.halfLength ?? 12} />}

      {kills.length > 0 && (
        <section className="rounded-xl border border-border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Crosshair size={14} className="text-primary" /> Последние убийства</h3>
          <div className="space-y-1 text-sm">
            {[...kills].reverse().slice(0, 10).map((k, i) => (
              <div key={i} className="flex items-center gap-2 min-w-0">
                <span className="w-8 shrink-0 text-xs text-muted-foreground">R{k.round + 1}</span>
                <span className={cn('truncate', k.attackerSide ? SIDE_TEXT[k.attackerSide] : 'text-muted-foreground')}>{k.attacker ?? '—'}</span>
                <span className="shrink-0 rounded bg-white/5 px-1.5 text-xs text-muted-foreground">{weaponName(k.weapon)}{k.headshot ? ' • HS' : ''}</span>
                <span className={cn('truncate', k.victimSide ? SIDE_TEXT[k.victimSide] : '')}>{k.victim}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {players && players.length > 0 && (
        <section className="rounded-xl border border-border p-4">
          <h3 className="mb-3 text-sm font-semibold">
            Игроки на сервере <span className="font-normal text-muted-foreground">({players.length})</span>
          </h3>
          <div className="grid gap-1 sm:grid-cols-2">
            {players.map((p, i) => (
              <div key={`${p.name}-${i}`} className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1 text-sm">
                <span className="truncate">{p.name}</span>
                {p.score > 0 && (
                  <span className="shrink-0 tabular-nums text-muted-foreground" title="Счёт игрока по A2S (обычно убийства)">{p.score}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Вкладка работает и без MatchZy: счёт, раунды и убийства читаются из лога игрового сервера, карта и игроки - из A2S. Команды, серия и подробная статистика появятся, когда матч запущен через MatchZy.
      </p>
    </>
  );
}

function GenericRoundStrip({ rounds, halfLength }: { rounds: GenericRound[]; halfLength: number }) {
  // The log can repeat a line when the same logaddress is registered twice
  const unique = new Map<number, GenericRound>();
  for (const round of rounds) unique.set(round.round, round);
  const sorted = [...unique.values()].sort((a, b) => a.round - b.round);
  const overtimeStart = halfLength * 2;
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
        Раунды
        <span className="text-[11px] font-normal text-muted-foreground">(по логу сервера)</span>
      </h3>
      <div className="flex flex-wrap gap-1">
        {sorted.map((r) => (
          <React.Fragment key={r.round}>
            {/* Regulation half, then the start of overtime and every 3 rounds in it */}
            {(r.round === halfLength || (r.round >= overtimeStart && (r.round - overtimeStart) % 3 === 0)) && <div className="mx-1 w-px self-stretch bg-border" />}
            <div
              title={`Раунд ${r.round + 1}: ${r.winner === 'ct' ? 'CT' : 'T'}`}
              className={cn('flex h-7 w-6 items-center justify-center rounded text-[10px] text-black', SIDE_BG[r.winner])}
            >
              {r.round + 1}
            </div>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

// How fresh the data is: the panel asks the game server every 2 s
function UpdateAge({ receivedAt, online }: { receivedAt: number; online: boolean }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - receivedAt) / 1000));
  return (
    <span className={cn('flex items-center gap-1', !online && 'text-amber-400')} title="Данные опрашиваются с игрового сервера каждые 2 секунды">
      {online ? <Wifi size={12} className="text-emerald-400" /> : <WifiOff size={12} />}
      {online ? (seconds < 2 ? 'только что' : `${seconds} с назад`) : 'нет связи'}
    </span>
  );
}

const CLOCK_PHASES: Record<string, { label: string; className: string }> = {
  live: { label: 'Раунд', className: 'text-white' },
  freezetime: { label: 'Фризтайм', className: 'text-sky-300' },
  bomb: { label: 'Бомба', className: 'text-red-400' },
  round_over: { label: 'Конец раунда', className: 'text-muted-foreground' },
  halftime: { label: 'Смена сторон', className: 'text-muted-foreground' },
  timeout_ct: { label: 'Тайм-аут CT', className: 'text-amber-400' },
  timeout_t: { label: 'Тайм-аут T', className: 'text-amber-400' },
};

// The server reports the timer every 2 s; in between it counts down here. A pause holds the freeze time.
function RoundClock({ clock, paused, receivedAt }: { clock: { phase: string; seconds: number }; paused: boolean; receivedAt: number }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const frozen = paused && clock.phase === 'freezetime';
  const left = Math.max(0, frozen ? clock.seconds : clock.seconds - Math.max(0, now - receivedAt) / 1000);
  const whole = Math.ceil(left);
  const phase = CLOCK_PHASES[clock.phase] ?? { label: clock.phase, className: 'text-white' };
  return (
    <div className={cn('mt-1 flex items-center justify-center gap-1.5 text-sm font-semibold tabular-nums', phase.className)}>
      {clock.phase === 'bomb' ? <Bomb size={13} /> : <Timer size={13} />}
      <span>{phase.label}</span>
      <span>{Math.floor(whole / 60)}:{String(whole % 60).padStart(2, '0')}</span>
    </div>
  );
}

function TeamHeader({ team, teamKey, showReady, align = 'left' }: {
  team: StatusTeam;
  teamKey: 'team1' | 'team2';
  showReady: boolean;
  align?: 'left' | 'right';
}) {
  const side = team.side;
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <div className={cn('text-base md:text-xl font-bold truncate', TEAM_TEXT[teamKey])}>{team.name || (teamKey === 'team1' ? 'Команда 1' : 'Команда 2')}</div>
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs', align === 'right' && 'justify-end')}>
        {side && (
          <span className={cn('font-bold uppercase', side === 'ct' ? 'text-sky-300' : 'text-amber-300')}>
            {side === 'ct' ? 'CT' : side === 't' ? 'T' : side}
          </span>
        )}
        {team.connected != null && (
          <span className="text-muted-foreground">{team.connected} {playersLabel(team.connected)}</span>
        )}
        {showReady && team.ready && (
          <span className="flex items-center gap-0.5 text-emerald-400"><Check size={10} /> готовы</span>
        )}
      </div>
    </div>
  );
}

function RoundStrip({ rounds, note }: { rounds: LiveRound[]; note?: string }) {
  const sorted = [...rounds].sort((a, b) => a.round - b.round);
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
        Раунды
        {note && <span className="text-[11px] font-normal text-muted-foreground">({note})</span>}
      </h3>
      <div className="flex flex-wrap gap-1">
        {sorted.map((r) => (
          <React.Fragment key={r.round}>
            {/* MR12: sides swap after round 12, overtime halves every 3 rounds after 24 */}
            {(r.round === 12 || (r.round >= 24 && (r.round - 24) % 3 === 0)) && <div className="mx-1 w-px self-stretch bg-border" />}
            <div
              title={`Раунд ${r.round + 1}: ${r.side ? (r.side === 'ct' ? 'CT' : 'T') : 'сторона неизвестна'}${typeof r.reason === 'number' ? `, ${reasonText(r.reason)}` : ''}`}
              className={cn('flex h-7 w-6 flex-col items-center justify-center rounded text-[10px] text-black', TEAM_BG[r.winner])}
            >
              {typeof r.reason === 'number' && <ReasonIcon reason={r.reason} />}
              <span className="leading-none">{r.round + 1}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

// Completed maps come from events or from the poll observations; the map being played is filled from get5_status
function SeriesMaps({ maps, numMaps, currentMapNumber, currentLive, currentScores, results }: {
  maps: string[] | null;
  numMaps: number | null;
  currentMapNumber: number | null;
  currentLive: boolean;
  currentScores: { team1Score: number; team2Score: number } | null;
  results: LiveMapResult[];
}) {
  const total = Math.max(
    numMaps ?? 0,
    maps?.length ?? 0,
    currentMapNumber != null ? currentMapNumber + 1 : 0,
    ...results.map((m) => m.mapNumber + 1),
  );
  if (!total) return null;

  const rows = Array.from({ length: total }, (_, i) => {
    const result = results.find((m) => m.mapNumber === i);
    return {
      mapNumber: i,
      mapName: result?.mapName ?? maps?.[i] ?? null,
      current: i === currentMapNumber,
      team1Score: result?.team1Score ?? (i === currentMapNumber ? currentScores?.team1Score : undefined),
      team2Score: result?.team2Score ?? (i === currentMapNumber ? currentScores?.team2Score : undefined),
      winner: result?.winner ?? null,
    };
  });

  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="mb-3 text-sm font-semibold">Карты серии</h3>
      <div className="space-y-1 text-sm">
        {rows.map((m) => (
          <div key={m.mapNumber} className={cn('flex items-center justify-between gap-2 rounded px-1', m.current && 'bg-white/5')}>
            <span className={cn('truncate', m.current ? 'text-white' : 'text-muted-foreground')}>
              Карта {m.mapNumber + 1}{m.mapName ? ` • ${m.mapName}` : ''}{m.current && currentLive ? ' • идёт' : ''}
            </span>
            <span className="tabular-nums">
              {m.team1Score == null || m.team2Score == null ? (
                <span className="text-muted-foreground">— : —</span>
              ) : (
                <>
                  <span className={m.winner === 'team1' ? 'font-bold text-sky-400' : ''}>{m.team1Score}</span>
                  {' : '}
                  <span className={m.winner === 'team2' ? 'font-bold text-amber-400' : ''}>{m.team2Score}</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlayersTable({ team, teamKey }: { team: LiveTeam; teamKey: 'team1' | 'team2' }) {
  const rows = [...team.players].sort((a, b) => (b.stats.kills ?? 0) - (a.stats.kills ?? 0) || (b.stats.damage ?? 0) - (a.stats.damage ?? 0));
  return (
    <section className="rounded-xl border border-border overflow-hidden">
      <div className={cn('px-4 py-2 text-sm font-bold border-b border-border', TEAM_TEXT[teamKey])}>{team.name || (teamKey === 'team1' ? 'Команда 1' : 'Команда 2')}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">Игрок</th>
              <th className="px-2 py-2 text-right font-medium">K</th>
              <th className="px-2 py-2 text-right font-medium">D</th>
              <th className="px-2 py-2 text-right font-medium">A</th>
              <th className="px-2 py-2 text-right font-medium">±</th>
              <th className="px-2 py-2 text-right font-medium">ADR</th>
              <th className="px-2 py-2 text-right font-medium">HS%</th>
              <th className="px-2 py-2 text-right font-medium" title="Раунды с убийством, ассистом, выживанием или разменом">KAST</th>
              <th className="px-2 py-2 text-right font-medium">Урон</th>
              <th className="px-3 py-2 text-right font-medium" title="Выигранные клатчи 1vX">Клатчи</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-4 text-center text-xs text-muted-foreground">Нет данных</td></tr>
            )}
            {rows.map((p) => {
              const s = p.stats;
              const kills = s.kills ?? 0;
              const deaths = s.deaths ?? 0;
              const diff = kills - deaths;
              const adr = s.rounds_played ? Math.round((s.damage ?? 0) / s.rounds_played) : 0;
              const hs = kills ? Math.round(((s.headshot_kills ?? 0) / kills) * 100) : 0;
              const kast = s.rounds_played ? Math.round(((s.kast ?? 0) / s.rounds_played) * 100) : 0;
              const clutches = (s['1v1'] ?? 0) + (s['1v2'] ?? 0) + (s['1v3'] ?? 0) + (s['1v4'] ?? 0) + (s['1v5'] ?? 0);
              return (
                <tr key={p.steamid || p.name} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 max-w-[10rem] truncate">{p.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{kills}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{deaths}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{s.assists ?? 0}</td>
                  <td className={cn('px-2 py-2 text-right tabular-nums', diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : '')}>{diff > 0 ? `+${diff}` : diff}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{adr}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{hs}%</td>
                  <td className="px-2 py-2 text-right tabular-nums">{kast}%</td>
                  <td className="px-2 py-2 text-right tabular-nums">{s.damage ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{clutches}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
