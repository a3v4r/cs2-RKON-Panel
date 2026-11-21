"use client";

import React from 'react';
import { Activity, Crosshair, Skull, Bomb, ShieldCheck, Timer, Flag, History, Play, RefreshCw, Swords, Users, MapIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { sendRconCommand } from '@/lib/rcon';
import { useT, type Text } from '@/lib/i18n';

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
  players: { steamid: string; name: string; stats: Stats }[];
}

interface LiveData {
  receivedAt: number;
  online: boolean;
  map: string | null;
  status: null | {
    state: string;
    paused: boolean;
    mapNumber: number;
    round: number;
    clock: { phase: string; seconds: number } | null;
    team1: { name: string; score: number; series: number; side: string } | null;
    team2: { name: string; score: number; series: number; side: string } | null;
  };
  live: null | {
    matchid: number | null;
    numMaps: number | null;
    mapNumber: number;
    mapName: string | null;
    team1: LiveTeam;
    team2: LiveTeam;
    rounds: { round: number; winner: 'team1' | 'team2'; side: string; reason: number }[];
    kills: { round: number; attacker: string | null; attackerTeam: 'team1' | 'team2' | null; victim: string; victimTeam: 'team1' | 'team2' | null; weapon: string; headshot: boolean }[];
    maps: { mapNumber: number; mapName: string | null; team1Score: number; team2Score: number; winner: 'team1' | 'team2' | null }[];
    finished: boolean;
  };
}

const STATE_LABELS: Record<string, Text> = {
  pre_veto: { ru: 'Ожидание вето', en: 'Waiting for veto' },
  veto: { ru: 'Вето', en: 'Veto' },
  warmup: { ru: 'Разминка', en: 'Warmup' },
  knife: { ru: 'Ножевой раунд', en: 'Knife round' },
  waiting_for_knife_decision: { ru: 'Выбор стороны', en: 'Side choice' },
  going_live: { ru: 'Старт', en: 'Going live' },
  live: { ru: 'Идёт игра', en: 'Live' },
  post_game: { ru: 'Карта окончена', en: 'Map over' },
};

// RoundEndReason (CounterStrikeSharp): 1 bomb exploded, 7 defused, 8/9 team eliminated, 12 time ran out, 17/18 surrender
function ReasonIcon({ reason }: { reason: number }) {
  if (reason === 1) return <Bomb size={10} />;
  if (reason === 7) return <ShieldCheck size={10} />;
  if (reason === 12) return <Timer size={10} />;
  if (reason === 17 || reason === 18) return <Flag size={10} />;
  return <Skull size={10} />;
}

const reasonText = (reason: number): Text =>
  reason === 1 ? { ru: 'бомба взорвана', en: 'bomb exploded' } : reason === 7 ? { ru: 'бомба разминирована', en: 'bomb defused' } : reason === 12 ? { ru: 'время вышло', en: 'time ran out' }
    : reason === 17 || reason === 18 ? { ru: 'сдача', en: 'surrender' } : { ru: 'все убиты', en: 'team eliminated' };

const weaponName = (weapon: string) => (weapon === 'planted_c4' || weapon === 'bomb' ? 'C4' : weapon);

// Team colours stay the same all match; the side (CT/T) is shown separately
const TEAM_TEXT = { team1: 'text-sky-400', team2: 'text-amber-400' } as const;
const TEAM_DOT = { team1: 'bg-sky-400', team2: 'bg-amber-400' } as const;
// Round badges, tinted like the Quatrix status badges
const TEAM_BADGE = { team1: 'bg-sky-500/15 text-sky-400 border-sky-500/30', team2: 'bg-amber-500/15 text-amber-400 border-amber-500/30' } as const;

// Quatrix card and button classes
const card = 'bg-card rounded-2xl border border-gray-800 shadow-2xl';
const btn = 'inline-flex items-center justify-center gap-1.5 px-5 py-1.5 h-[34px] text-sm rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 whitespace-nowrap';
const btnPrimary = 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20';
const btnSecondary = 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50';
const btnDanger = 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20';
const pill = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border';

// Card header: icon chip + bold title, as the Quatrix dashboard cards
function CardHeader({ icon, title, subtitle, right, className }: { icon: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">{icon}</div>
        <div className="min-w-0">
          <h3 className="text-xs font-black text-white uppercase tracking-wider truncate">{title}</h3>
          {subtitle && <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest truncate mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function LiveMatch({ serverId }: { serverId: number }) {
  const { t, lang } = useT();
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

  React.useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) return <div className={cn('p-6 text-sm', error ? 'text-red-400' : 'text-gray-500')}>{error || t('Загрузка...', 'Loading...')}</div>;

  const { status, live } = data;
  const t1 = status?.team1 ?? (live ? { name: live.team1.name, score: live.team1.score, series: live.team1.seriesScore, side: '' } : null);
  const t2 = status?.team2 ?? (live ? { name: live.team2.name, score: live.team2.score, series: live.team2.seriesScore, side: '' } : null);
  const stateLabel = status ? (status.paused ? t('ПАУЗА', 'PAUSED') : STATE_LABELS[status.state]?.[lang] ?? status.state) : live?.finished ? t('Матч завершён', 'Match finished') : t('Матч не загружен', 'No match loaded');
  const isLive = !status?.paused && status?.state === 'live';

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      {/* Scoreboard */}
      <section className={cn(card, 'p-4 sm:p-6')}>
        <CardHeader
          icon={<Activity size={18} />}
          title={data.map ?? '---'}
          subtitle={<>{status ? `${t('карта', 'map')} ${status.mapNumber + 1}` : ''}{status && status.round >= 0 ? ` • ${t('раунд', 'round')} ${status.round + 1}` : ''}</>}
          right={
            <span className={cn(
              pill,
              status?.paused ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                : isLive ? 'bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]'
                  : 'bg-gray-500/10 text-gray-400 border-gray-500/20',
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', status?.paused ? 'bg-yellow-500' : isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-500')} />
              {stateLabel}
            </span>
          }
        />
        {t1 && t2 ? (
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
            <TeamHeader name={t1.name} side={t1.side} team="team1" />
            <div className="text-center">
              <div className="text-3xl sm:text-5xl font-black tabular-nums tracking-tight text-white whitespace-nowrap">
                <span className={TEAM_TEXT.team1}>{t1.score}</span>
                <span className="text-gray-600 mx-1.5 sm:mx-3">:</span>
                <span className={TEAM_TEXT.team2}>{t2.score}</span>
              </div>
              <div className="mt-1 text-[10px] text-gray-500 font-black uppercase tracking-widest whitespace-nowrap">{t('серия', 'series')} {t1.series}:{t2.series}</div>
              {status?.clock && <RoundClock clock={status.clock} paused={status.paused} receivedAt={data.receivedAt} />}
            </div>
            <TeamHeader name={t2.name} side={t2.side} team="team2" align="right" />
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">{t('Запустите матч в разделе «Запуск матча» - здесь появятся счёт и статистика.', 'Start a match in the "Match launch" section - the score and stats will show up here.')}</p>
        )}
      </section>

      {status?.state === 'live' && <RoundRestore serverId={serverId} paused={status.paused} round={status.round} onDone={load} />}

      {status && !live && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-gray-400">
          {t('Статистика игроков появится после первого раунда, если матч запущен из панели (раздел «Запуск матча»).', 'Player stats appear after the first round if the match was started from the panel ("Match launch" section).')}
        </div>
      )}

      {live && (
        <>
          {live.rounds.length > 0 && <RoundStrip rounds={live.rounds} />}

          <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
            <PlayersTable team={live.team1} teamKey="team1" />
            <PlayersTable team={live.team2} teamKey="team2" />
          </div>

          <div className="grid gap-4 md:gap-6 md:grid-cols-2">
            {live.kills.length > 0 && (
              <section className={cn(card, 'overflow-hidden flex flex-col min-w-0')}>
                <CardHeader icon={<Crosshair size={18} />} title={t('Последние убийства', 'Recent kills')} className="p-4 sm:p-6 border-b border-gray-800/60" />
                <div className="divide-y divide-gray-800/40">
                  {[...live.kills].reverse().slice(0, 10).map((k, i) => (
                    <div key={i} className="px-4 sm:px-6 py-3 flex items-center gap-3 min-w-0 hover:bg-white/[0.02] transition-colors">
                      <span className="w-8 shrink-0 text-[9px] text-gray-500 font-black uppercase tracking-widest tabular-nums">R{k.round + 1}</span>
                      <span className={cn('truncate text-sm font-bold', k.attackerTeam ? TEAM_TEXT[k.attackerTeam] : 'text-gray-500')}>{k.attacker ?? '---'}</span>
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-800/60 text-gray-400 border border-gray-700/50">
                        {weaponName(k.weapon)}
                        {k.headshot && <span className="text-red-400">• HS</span>}
                      </span>
                      <span className={cn('truncate text-sm font-semibold', k.victimTeam ? TEAM_TEXT[k.victimTeam] : 'text-gray-300')}>{k.victim}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {live.maps.length > 0 && (
              <section className={cn(card, 'overflow-hidden flex flex-col min-w-0')}>
                <CardHeader icon={<MapIcon size={18} />} title={t('Карты серии', 'Series maps')} className="p-4 sm:p-6 border-b border-gray-800/60" />
                <div className="divide-y divide-gray-800/40">
                  {live.maps.map((m) => (
                    <div key={m.mapNumber} className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-200 truncate">{t('Карта', 'Map')} {m.mapNumber + 1}</div>
                        {m.mapName && <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5 truncate">{m.mapName}</div>}
                      </div>
                      <span className="shrink-0 text-lg font-black tabular-nums">
                        <span className={m.winner === 'team1' ? 'text-sky-400' : 'text-gray-400'}>{m.team1Score}</span>
                        <span className="text-gray-600">{' : '}</span>
                        <span className={m.winner === 'team2' ? 'text-amber-400' : 'text-gray-400'}>{m.team2Score}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const CLOCK_PHASES: Record<string, { label: Text; className: string }> = {
  live: { label: { ru: 'Раунд', en: 'Round' }, className: 'text-white' },
  freezetime: { label: { ru: 'Фризтайм', en: 'Freeze time' }, className: 'text-sky-300' },
  bomb: { label: { ru: 'Бомба', en: 'Bomb' }, className: 'text-red-400' },
  round_over: { label: { ru: 'Конец раунда', en: 'Round over' }, className: 'text-gray-400' },
  halftime: { label: { ru: 'Смена сторон', en: 'Halftime' }, className: 'text-gray-400' },
  timeout_ct: { label: { ru: 'Тайм-аут CT', en: 'CT timeout' }, className: 'text-amber-400' },
  timeout_t: { label: { ru: 'Тайм-аут T', en: 'T timeout' }, className: 'text-amber-400' },
};

// The server reports the timer every 3 s; in between it counts down here. A pause holds the freeze time.
function RoundClock({ clock, paused, receivedAt }: { clock: { phase: string; seconds: number }; paused: boolean; receivedAt: number }) {
  const { lang } = useT();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const frozen = paused && clock.phase === 'freezetime';
  const left = Math.max(0, frozen ? clock.seconds : clock.seconds - Math.max(0, now - receivedAt) / 1000);
  const whole = Math.ceil(left);
  const phase = CLOCK_PHASES[clock.phase] ?? { label: { ru: clock.phase, en: clock.phase }, className: 'text-white' };
  return (
    <div className={cn('mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-background/50 border border-gray-800 text-xs font-bold tabular-nums whitespace-nowrap', phase.className)}>
      {clock.phase === 'bomb' ? <Bomb size={12} /> : <Timer size={12} />}
      <span className="hidden sm:inline">{phase.label[lang]}</span>
      <span className="font-mono">{Math.floor(whole / 60)}:{String(whole % 60).padStart(2, '0')}</span>
    </div>
  );
}

interface Backup {
  round: number;
  time: string;
  team1Score: number;
  team2Score: number;
}

// Round restore: the list comes from the backups on the game server, so it works for any match MatchZy runs
function RoundRestore({ serverId, paused, round, onDone }: { serverId: number; paused: boolean; round: number; onDone: () => void }) {
  const { t } = useT();
  const [backups, setBackups] = React.useState<Backup[] | null>(null);
  const [selected, setSelected] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const loadBackups = React.useCallback(async () => {
    try {
      const { backups } = await api<{ backups: Backup[] }>(`/api/servers/${serverId}/restore`);
      setBackups(backups);
      // By default the start of the current round
      setSelected((prev) => (backups.some((b) => String(b.round) === prev) ? prev : backups.length ? String(backups[backups.length - 1].round) : ''));
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  }, [serverId]);

  // While the list is open, keep it in step with the rounds being played
  React.useEffect(() => {
    if (backups) loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const restore = async () => {
    const backup = backups?.find((b) => String(b.round) === selected);
    if (!backup) return;
    if (!confirm(t(
      `Откатить игру к началу раунда ${backup.round + 1} (счёт ${backup.team1Score}:${backup.team2Score})?\nВсё, что было после, пропадёт. Матч встанет на паузу.`,
      `Restore the game to the start of round ${backup.round + 1} (score ${backup.team1Score}:${backup.team2Score})?\nEverything after it will be lost. The match will be paused.`,
    ))) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/servers/${serverId}/restore`, { body: { round: backup.round } });
      setMessage({ ok: true, text: t(
        `Откат к раунду ${backup.round + 1} выполнен, матч на паузе. Когда игроки готовы - снимите паузу.`,
        `Restored to round ${backup.round + 1}, the match is paused. Unpause when the players are ready.`,
      ) });
      setTimeout(onDone, 1500);
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const unpause = async () => {
    setBusy(true);
    try {
      await sendRconCommand(serverId, 'css_forceunpause');
      setMessage(null);
      setTimeout(onDone, 1000);
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn(card, 'p-4 sm:p-6 space-y-4')}>
      <CardHeader
        icon={<History size={18} />}
        title={t('Откат раунда', 'Round restore')}
        right={
          <div className="flex flex-wrap gap-2">
            {paused && (
              <button onClick={unpause} disabled={busy} className={cn(btn, btnPrimary)}>
                <Play size={14} /> {t('Снять паузу', 'Unpause')}
              </button>
            )}
            <button onClick={loadBackups} disabled={busy} className={cn(btn, btnSecondary)}>
              <RefreshCw size={14} className={cn(busy && 'animate-spin')} /> {backups ? t('Обновить', 'Refresh') : t('Выбрать раунд', 'Choose round')}
            </button>
          </div>
        }
      />
      {backups && (backups.length === 0 ? (
        <p className="text-sm text-gray-500">{t('На этой карте ещё нет точек отката.', 'No round backups on this map yet.')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-0 flex-1 basis-56 h-[34px] bg-background/50 border border-gray-800 rounded-xl px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-primary transition-all"
          >
            {[...backups].reverse().map((b) => (
              <option key={b.round} value={b.round}>
                {t('Начало раунда', 'Start of round')} {b.round + 1} • {t('счёт', 'score')} {b.team1Score}:{b.team2Score} • {b.time}
              </option>
            ))}
          </select>
          <button onClick={restore} disabled={busy || !selected} className={cn(btn, btnDanger)}>
            <History size={14} /> {t('Откатить', 'Restore')}
          </button>
        </div>
      ))}
      {message && (
        <div className={cn('rounded-xl border p-3 text-xs font-medium', message.ok ? 'border-green-500/20 bg-green-500/10 text-green-400' : 'border-red-500/20 bg-red-500/10 text-red-400')}>{message.text}</div>
      )}
    </section>
  );
}

function TeamHeader({ name, side, team, align = 'left' }: { name: string; side: string; team: 'team1' | 'team2'; align?: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0 flex flex-col gap-1.5', align === 'right' ? 'items-end text-right' : 'items-start')}>
      <div className={cn('max-w-full text-sm sm:text-2xl font-black tracking-tight truncate', TEAM_TEXT[team])}>{name}</div>
      {side && (
        <span className={cn(pill, 'px-2 py-0.5', side === 'ct' ? 'bg-sky-500/10 text-sky-300 border-sky-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20')}>
          {side === 'ct' ? 'CT' : side === 't' ? 'T' : side}
        </span>
      )}
    </div>
  );
}

function RoundStrip({ rounds }: { rounds: { round: number; winner: 'team1' | 'team2'; side: string; reason: number }[] }) {
  const { t, lang } = useT();
  const sorted = [...rounds].sort((a, b) => a.round - b.round);
  return (
    <section className={cn(card, 'p-4 sm:p-6')}>
      <CardHeader icon={<Swords size={18} />} title={t('Раунды', 'Rounds')} className="mb-4" />
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((r) => (
          <React.Fragment key={r.round}>
            {/* MR12: sides swap after round 12, overtime halves every 3 rounds after 24 */}
            {(r.round === 12 || (r.round >= 24 && (r.round - 24) % 3 === 0)) && <div className="mx-1 w-px self-stretch bg-gray-800" />}
            <div
              title={`${t('Раунд', 'Round')} ${r.round + 1}: ${r.side === 'ct' ? 'CT' : 'T'}, ${reasonText(r.reason)[lang]}`}
              className={cn('flex h-8 w-7 flex-col items-center justify-center gap-0.5 rounded-lg border text-[10px] font-black tabular-nums', TEAM_BADGE[r.winner])}
            >
              <ReasonIcon reason={r.reason} />
              <span className="leading-none">{r.round + 1}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

const th = 'px-3 py-4 border-b border-gray-800/50 text-right';
const td = 'px-3 py-4 text-right text-sm font-mono tabular-nums text-gray-300';

function PlayersTable({ team, teamKey }: { team: LiveTeam; teamKey: 'team1' | 'team2' }) {
  const { t } = useT();
  const rows = [...team.players].sort((a, b) => (b.stats.kills ?? 0) - (a.stats.kills ?? 0) || (b.stats.damage ?? 0) - (a.stats.damage ?? 0));
  return (
    <section className={cn(card, 'overflow-hidden min-w-0')}>
      <div className="px-4 sm:px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn('w-2 h-2 rounded-full shrink-0', TEAM_DOT[teamKey])} />
          <h3 className={cn('text-sm font-black uppercase tracking-wider truncate', TEAM_TEXT[teamKey])}>{team.name || (teamKey === 'team1' ? t('Команда 1', 'Team 1') : t('Команда 2', 'Team 2'))}</h3>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-[10px] text-gray-500 font-black uppercase tracking-widest"><Users size={12} />{rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
              <th className="px-4 sm:px-6 py-4 border-b border-gray-800/50 text-left">{t('Игрок', 'Player')}</th>
              <th className={th}>K</th>
              <th className={th}>D</th>
              <th className={th}>A</th>
              <th className={th}>±</th>
              <th className={th}>ADR</th>
              <th className={th}>HS%</th>
              <th className={th} title={t('Раунды с убийством, ассистом, выживанием или разменом', 'Rounds with a kill, assist, survival or trade')}>KAST</th>
              <th className={th}>{t('Урон', 'Damage')}</th>
              <th className={cn(th, 'pr-4 sm:pr-6')} title={t('Выигранные клатчи 1vX', 'Clutches won (1vX)')}>{t('Клатчи', 'Clutches')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/30">
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-6 py-12 text-center text-sm text-gray-500">{t('Нет данных', 'No data')}</td></tr>
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
                <tr key={p.steamid || p.name} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn('w-8 h-8 shrink-0 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-bold border border-gray-700', TEAM_TEXT[teamKey])}>{p.name.charAt(0).toUpperCase() || '?'}</div>
                      <span className="font-bold text-white text-sm truncate max-w-[10rem]">{p.name}</span>
                    </div>
                  </td>
                  <td className={cn(td, 'font-bold text-white')}>{kills}</td>
                  <td className={td}>{deaths}</td>
                  <td className={td}>{s.assists ?? 0}</td>
                  <td className={cn(td, 'font-bold', diff > 0 ? 'text-green-500' : diff < 0 ? 'text-red-500' : 'text-gray-500')}>{diff > 0 ? `+${diff}` : diff}</td>
                  <td className={td}>{adr}</td>
                  <td className={td}>{hs}%</td>
                  <td className={td}>{kast}%</td>
                  <td className={td}>{s.damage ?? 0}</td>
                  <td className={cn(td, 'pr-4 sm:pr-6')}>{clutches}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
