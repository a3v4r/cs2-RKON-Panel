"use client";

import React from 'react';
import { Bomb, ChevronDown, ChevronUp, Crosshair, Flag, History, Map as MapIcon, Play, RefreshCw, Rocket, ShieldCheck, Skull, Swords, Target, Timer, Trophy, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { sendRconCommand } from '@/lib/rcon';
import { useT, type Text } from '@/lib/i18n';
import { mapImage } from '@/lib/maps';

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

type TeamKey = 'team1' | 'team2';
type Round = { round: number; winner: TeamKey; side: string; reason: number };

interface LiveData {
  receivedAt: number;
  online: boolean;
  map: string | null;
  status: null | {
    state: string;
    paused: boolean;
    matchid?: number | string | null;
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
    rounds: Round[];
    kills: { round: number; attacker: string | null; attackerTeam: TeamKey | null; victim: string; victimTeam: TeamKey | null; weapon: string; headshot: boolean }[];
    maps: { mapNumber: number; mapName: string | null; team1Score: number; team2Score: number; winner: TeamKey | null }[];
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
function ReasonIcon({ reason, size = 11 }: { reason: number; size?: number }) {
  if (reason === 1) return <Bomb size={size} />;
  if (reason === 7) return <ShieldCheck size={size} />;
  if (reason === 12) return <Timer size={size} />;
  if (reason === 17 || reason === 18) return <Flag size={size} />;
  return <Skull size={size} />;
}

const reasonText = (reason: number): Text =>
  reason === 1 ? { ru: 'бомба взорвана', en: 'bomb exploded' } : reason === 7 ? { ru: 'бомба разминирована', en: 'bomb defused' } : reason === 12 ? { ru: 'время вышло', en: 'time ran out' }
    : reason === 17 || reason === 18 ? { ru: 'сдача', en: 'surrender' } : { ru: 'все убиты', en: 'team eliminated' };

const WEAPONS: Record<string, string> = {
  ak47: 'AK-47', m4a1: 'M4A4', m4a1_silencer: 'M4A1-S', m4a1_silencer_off: 'M4A1-S', usp_silencer: 'USP-S', usp_silencer_off: 'USP-S',
  hkp2000: 'P2000', glock: 'Glock-18', deagle: 'Deagle', revolver: 'R8', p250: 'P250', fiveseven: 'Five-SeveN', tec9: 'Tec-9',
  cz75a: 'CZ75', elite: 'Dual Berettas', awp: 'AWP', ssg08: 'SSG 08', scar20: 'SCAR-20', g3sg1: 'G3SG1', galilar: 'Galil AR',
  famas: 'FAMAS', aug: 'AUG', sg556: 'SG 553', mp9: 'MP9', mac10: 'MAC-10', mp7: 'MP7', mp5sd: 'MP5-SD', ump45: 'UMP-45',
  p90: 'P90', bizon: 'PP-Bizon', nova: 'Nova', xm1014: 'XM1014', mag7: 'MAG-7', sawedoff: 'Sawed-Off', m249: 'M249', negev: 'Negev',
  hegrenade: 'HE', inferno: 'Molotov', molotov: 'Molotov', incgrenade: 'Incendiary', taser: 'Zeus', knife: 'Knife',
  planted_c4: 'C4', bomb: 'C4', world: 'World',
};
const weaponName = (weapon: string) => WEAPONS[weapon] ?? (weapon.startsWith('knife') || weapon.startsWith('bayonet') ? 'Knife' : weapon.toUpperCase());

// team colours fixed for the match, side shown separately
const TEAM_TEXT = { team1: 'text-sky-400', team2: 'text-amber-400' } as const;
const TEAM_DOT = { team1: 'bg-sky-400', team2: 'bg-amber-400' } as const;
const TEAM_CHIP = { team1: 'bg-sky-500/10 text-sky-400 border-sky-500/30', team2: 'bg-amber-500/10 text-amber-400 border-amber-500/30' } as const;
const TEAM_CELL = { team1: 'bg-sky-500/20 text-sky-300 border-sky-500/40', team2: 'bg-amber-500/20 text-amber-300 border-amber-500/40' } as const;

const card = 'bg-card rounded-2xl border border-gray-800 shadow-2xl';
const btn = 'inline-flex items-center justify-center gap-1.5 px-5 py-1.5 h-[34px] text-sm rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 whitespace-nowrap';
const btnPrimary = 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20';
const btnSecondary = 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50';
const btnDanger = 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20';
const pill = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border';

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

function StatCard({ title, value, icon, description, color, valueClass }: { title: string; value: React.ReactNode; icon: React.ReactNode; description: string; color: string; valueClass?: string }) {
  return (
    <div className="p-4 sm:p-6 bg-card rounded-2xl border border-gray-800/60 hover:border-white/10 transition-all hover:translate-y-[-2px] group shadow-lg shadow-black/20 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest truncate">{title}</span>
        <div className={cn('p-2 rounded-lg bg-white/5 group-hover:scale-110 transition-transform shrink-0', color)}>{icon}</div>
      </div>
      <div className={cn('text-xl sm:text-3xl font-black text-white truncate tabular-nums', valueClass)}>{value}</div>
      <p className="text-xs text-gray-500 mt-2 font-medium opacity-80 truncate">{description}</p>
    </div>
  );
}

export function LiveMatch({ serverId, onLaunch }: { serverId: number; onLaunch?: () => void }) {
  const { t } = useT();
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

  if (!data) {
    return (
      <div className="p-3 md:p-6">
        {error
          ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
          : <div className={cn(card, 'h-64 animate-pulse')} />}
      </div>
    );
  }

  const { status, live } = data;
  // finished match stays until something else loads, only if it was actually played
  const lastMatch = !status && live && (live.rounds.length > 0 || live.maps.length > 0) ? live : null;
  const current = status ? live : null;

  if (!status) {
    return (
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        <section className={cn(card, 'px-6 py-14 sm:py-20 flex flex-col items-center text-center')}>
          <div className={cn('p-4 rounded-2xl mb-5', data.online ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500')}>
            {data.online ? <Swords size={32} /> : <WifiOff size={32} />}
          </div>
          <h3 className="text-xl font-bold text-white">
            {data.online ? t('Матч не запущен', 'No match running') : t('Сервер не на связи', 'Server is offline')}
          </h3>
          <p className="text-sm text-gray-500 mt-2 max-w-md">
            {data.online
              ? t('Загрузите матч в разделе «Запуск матча»: здесь появятся счёт, раунды и статистика игроков.', 'Load a match in "Match setup": the score, rounds and player stats will show up here.')
              : t('Запустите сервер в разделе «Серверы», затем загрузите на него матч.', 'Start the server in "Servers", then load a match on it.')}
          </p>
          {onLaunch && data.online && (
            <button onClick={onLaunch} className={cn(btn, btnPrimary, 'mt-6 h-11 px-8')}>
              <Rocket size={16} /> {t('Запустить матч', 'Start a match')}
            </button>
          )}
        </section>

        {lastMatch && (
          <>
            <h3 className="pt-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('Последний матч', 'Last match')}</h3>
            <MatchView data={data} live={lastMatch} serverId={serverId} onReload={load} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
      <MatchView data={data} live={current} serverId={serverId} onReload={load} />
      {!current && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-gray-400">
          {t('Статистика игроков появится после первого раунда, если матч запущен из панели (раздел «Запуск матча»).', 'Player stats appear after the first round if the match was started from the panel ("Match setup" section).')}
        </div>
      )}
    </div>
  );
}

function MatchView({ data, live, serverId, onReload }: { data: LiveData; live: LiveData['live']; serverId: number; onReload: () => void }) {
  const { t, lang } = useT();
  const { status } = data;
  const t1 = status?.team1 ?? (live ? { name: live.team1.name, score: live.team1.score, series: live.team1.seriesScore, side: '' } : null);
  const t2 = status?.team2 ?? (live ? { name: live.team2.name, score: live.team2.score, series: live.team2.seriesScore, side: '' } : null);
  const map = (status ? data.map : live?.mapName) ?? live?.mapName ?? data.map;
  const mapNumber = status?.mapNumber ?? live?.mapNumber ?? 0;
  const isLive = !!status && !status.paused && status.state === 'live';

  const stateLabel = status
    ? status.paused ? t('Пауза', 'Paused') : STATE_LABELS[status.state]?.[lang] ?? status.state
    : live?.finished ? t('Матч завершён', 'Match finished') : t('Не доигран', 'Not finished');
  const stateClass = status?.paused ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
    : isLive ? 'bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]'
      : 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  const dotClass = status?.paused ? 'bg-yellow-500' : isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-500';

  const kills = live?.kills ?? [];
  // panel keeps only the latest kills; totals come from player stats
  const allPlayers = live ? [...live.team1.players, ...live.team2.players] : [];
  const totalKills = allPlayers.reduce((n, p) => n + (p.stats.kills ?? 0), 0);
  const headshots = allPlayers.reduce((n, p) => n + (p.stats.headshot_kills ?? 0), 0);
  const round = status && status.round >= 0 ? status.round + 1 : live?.rounds.length ? Math.max(...live.rounds.map((r) => r.round)) + 1 : 0;
  const leader: TeamKey | null = t1 && t2 && t1.score !== t2.score ? (t1.score > t2.score ? 'team1' : 'team2') : null;

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-gray-800 shadow-2xl bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mapImage(map)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/85 to-card/40" />
        <div className="relative p-4 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg sm:text-2xl font-black text-white uppercase tracking-tight truncate">{map ?? t('Карта неизвестна', 'Unknown map')}</div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                {t('Карта', 'Map')} {mapNumber + 1}{live?.numMaps ? ` ${t('из', 'of')} ${live.numMaps}` : ''}
                {live?.matchid != null || status?.matchid != null ? ` · ${t('матч', 'match')} #${status?.matchid ?? live?.matchid}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!data.online && <span className={cn(pill, 'bg-red-500/10 text-red-500 border-red-500/20')}><WifiOff size={11} />{t('Нет связи', 'Offline')}</span>}
              <span className={cn(pill, stateClass)}><span className={cn('w-1.5 h-1.5 rounded-full', dotClass)} />{stateLabel}</span>
            </div>
          </div>

          {t1 && t2 && (
            <div className="mt-6 sm:mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
              <TeamHeader name={t1.name} side={t1.side} team="team1" />
              <div className="text-center">
                <div className="text-4xl sm:text-7xl font-black tabular-nums tracking-tight whitespace-nowrap leading-none">
                  <span className={leader === 'team2' ? 'text-gray-500' : 'text-white'}>{t1.score}</span>
                  <span className="text-gray-600 mx-2 sm:mx-4">:</span>
                  <span className={leader === 'team1' ? 'text-gray-500' : 'text-white'}>{t2.score}</span>
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-background/60 border border-gray-800 text-[10px] text-gray-400 font-black uppercase tracking-widest whitespace-nowrap">
                  <Trophy size={11} /> {t('серия', 'series')} {t1.series}:{t2.series}
                </div>
              </div>
              <TeamHeader name={t2.name} side={t2.side} team="team2" align="right" />
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title={t('Раунд', 'Round')} value={round || '-'} icon={<Swords size={18} />} color="text-primary" description={live?.rounds.length ? t(`сыграно раундов: ${live.rounds.length}`, `rounds played: ${live.rounds.length}`) : t('раунды ещё не сыграны', 'no rounds played yet')} />
        <ClockCard clock={status?.clock ?? null} paused={!!status?.paused} receivedAt={data.receivedAt} />
        <StatCard title={t('Убийства', 'Kills')} value={totalKills} icon={<Crosshair size={18} />} color="text-red-500" description={totalKills ? t(`в голову: ${Math.round((headshots / totalKills) * 100)}%`, `headshots: ${Math.round((headshots / totalKills) * 100)}%`) : t('пока нет', 'none yet')} />
        <StatCard
          title={t('Серия', 'Series')}
          value={t1 && t2 ? `${t1.series} : ${t2.series}` : '-'}
          icon={<Trophy size={18} />}
          color="text-amber-500"
          description={live?.numMaps ? `BO${live.numMaps}` : t('формат неизвестен', 'format unknown')}
        />
      </div>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-3 items-start">
        <div className="xl:col-span-2 space-y-4 md:space-y-6 min-w-0">
          {live && live.rounds.length > 0 && <RoundHistory rounds={live.rounds} t1={t1?.name ?? live.team1.name} t2={t2?.name ?? live.team2.name} />}
          {live && <PlayersTable team={live.team1} teamKey="team1" />}
          {live && <PlayersTable team={live.team2} teamKey="team2" />}
        </div>

        <div className="space-y-4 md:space-y-6 min-w-0">
          {status?.state === 'live' && <RoundRestore serverId={serverId} paused={status.paused} round={status.round} onDone={onReload} />}

          <section className={cn(card, 'overflow-hidden flex flex-col min-w-0')}>
            <CardHeader icon={<Target size={18} />} title={t('Последние убийства', 'Recent kills')} className="p-4 sm:p-6 border-b border-gray-800/60" />
            {kills.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-gray-500">{t('Убийств пока не было', 'No kills yet')}</p>
            ) : (
              <div className="divide-y divide-gray-800/40">
                {[...kills].reverse().slice(0, 12).map((k, i) => (
                  <div key={i} className="px-4 sm:px-6 py-3 flex items-center gap-2 min-w-0 hover:bg-white/[0.02] transition-colors">
                    <span className="w-8 shrink-0 text-[9px] text-gray-500 font-black uppercase tracking-widest tabular-nums">R{k.round + 1}</span>
                    <span className={cn('truncate text-sm font-bold', k.attackerTeam ? TEAM_TEXT[k.attackerTeam] : 'text-gray-500')}>{k.attacker ?? '---'}</span>
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-800/60 text-gray-400 border border-gray-700/50">
                      {weaponName(k.weapon)}
                      {k.headshot && <span className="text-red-400">HS</span>}
                    </span>
                    <span className={cn('truncate text-sm font-semibold', k.victimTeam ? TEAM_TEXT[k.victimTeam] : 'text-gray-300')}>{k.victim}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {live && live.maps.length > 0 && (
            <section className={cn(card, 'overflow-hidden flex flex-col min-w-0')}>
              <CardHeader icon={<MapIcon size={18} />} title={t('Карты серии', 'Series maps')} className="p-4 sm:p-6 border-b border-gray-800/60" />
              <div className="divide-y divide-gray-800/40">
                {live.maps.map((m) => (
                  <div key={m.mapNumber} className="px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mapImage(m.mapName)} alt="" className="w-14 h-9 rounded-lg object-cover border border-gray-800 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-200 truncate">{m.mapName ?? `${t('Карта', 'Map')} ${m.mapNumber + 1}`}</div>
                      <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{t('Карта', 'Map')} {m.mapNumber + 1}</div>
                    </div>
                    <span className="shrink-0 text-lg font-black tabular-nums">
                      <span className={m.winner === 'team1' ? 'text-sky-400' : 'text-gray-500'}>{m.team1Score}</span>
                      <span className="text-gray-600">{' : '}</span>
                      <span className={m.winner === 'team2' ? 'text-amber-400' : 'text-gray-500'}>{m.team2Score}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
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

// timer arrives every 3 s, counted down locally in between; pause holds freeze time
function ClockCard({ clock, paused, receivedAt }: { clock: { phase: string; seconds: number } | null; paused: boolean; receivedAt: number }) {
  const { t, lang } = useT();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!clock) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [clock]);
  if (!clock) {
    return <StatCard title={t('Таймер', 'Timer')} value="-" icon={<Timer size={18} />} color="text-sky-400" description={paused ? t('матч на паузе', 'match paused') : t('нет данных от сервера', 'no data from the server')} />;
  }
  const frozen = paused && clock.phase === 'freezetime';
  const left = Math.max(0, frozen ? clock.seconds : clock.seconds - Math.max(0, now - receivedAt) / 1000);
  const whole = Math.ceil(left);
  const phase = CLOCK_PHASES[clock.phase] ?? { label: { ru: clock.phase, en: clock.phase }, className: 'text-white' };
  return (
    <StatCard
      title={t('Таймер', 'Timer')}
      value={`${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`}
      valueClass={cn('font-mono', phase.className)}
      icon={clock.phase === 'bomb' ? <Bomb size={18} /> : <Timer size={18} />}
      color={clock.phase === 'bomb' ? 'text-red-500' : 'text-sky-400'}
      description={phase.label[lang]}
    />
  );
}

interface Backup {
  round: number;
  time: string;
  team1Score: number;
  team2Score: number;
}

// list comes from the game server backups, so any MatchZy match works
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
      setSelected((prev) => (backups.some((b) => String(b.round) === prev) ? prev : backups.length ? String(backups[backups.length - 1].round) : ''));
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  }, [serverId]);

  // keep in step with live rounds while open
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
      <CardHeader icon={<History size={18} />} title={t('Откат раунда', 'Round restore')} subtitle={t('к началу выбранного раунда', 'to the start of a round')} />
      <div className="flex flex-wrap gap-2">
        {paused && (
          <button onClick={unpause} disabled={busy} className={cn(btn, btnPrimary, 'flex-1')}>
            <Play size={14} /> {t('Снять паузу', 'Unpause')}
          </button>
        )}
        <button onClick={loadBackups} disabled={busy} className={cn(btn, btnSecondary, 'flex-1')}>
          <RefreshCw size={14} className={cn(busy && 'animate-spin')} /> {backups ? t('Обновить', 'Refresh') : t('Выбрать раунд', 'Choose round')}
        </button>
      </div>
      {backups && (backups.length === 0 ? (
        <p className="text-sm text-gray-500">{t('На этой карте ещё нет точек отката.', 'No round backups on this map yet.')}</p>
      ) : (
        <div className="space-y-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full h-[38px] bg-background/50 border border-gray-800 rounded-xl px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-primary transition-all"
          >
            {[...backups].reverse().map((b) => (
              <option key={b.round} value={b.round}>
                {t('Раунд', 'Round')} {b.round + 1} · {b.team1Score}:{b.team2Score} · {b.time}
              </option>
            ))}
          </select>
          <button onClick={restore} disabled={busy || !selected} className={cn(btn, btnDanger, 'w-full')}>
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

const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

function TeamHeader({ name, side, team, align = 'left' }: { name: string; side: string; team: TeamKey; align?: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0 flex items-center gap-3 sm:gap-4', align === 'right' && 'flex-row-reverse text-right')}>
      <div className={cn('hidden sm:flex w-14 h-14 rounded-2xl border items-center justify-center text-lg font-black shrink-0', TEAM_CHIP[team])}>{initials(name)}</div>
      <div className={cn('min-w-0 flex flex-col gap-1.5', align === 'right' ? 'items-end' : 'items-start')}>
        <div className="max-w-full text-sm sm:text-2xl font-black tracking-tight leading-tight text-white line-clamp-2 break-words sm:truncate">{name}</div>
        <div className={cn('flex items-center gap-1.5', align === 'right' && 'flex-row-reverse')}>
          <span className={cn('w-2 h-2 rounded-full', TEAM_DOT[team])} />
          {side && (
            <span className={cn(pill, 'px-2 py-0.5', side === 'ct' ? 'bg-sky-500/10 text-sky-300 border-sky-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20')}>
              {side === 'ct' ? 'CT' : side === 't' ? 'T' : side}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// one row per team, filled cell = round won
function RoundHistory({ rounds, t1, t2 }: { rounds: Round[]; t1: string; t2: string }) {
  const { t, lang } = useT();
  const byRound = new Map(rounds.map((r) => [r.round, r]));
  const total = Math.max(24, ...rounds.map((r) => r.round + 1));
  const numbers = Array.from({ length: total }, (_, i) => i);
  // MR12: sides swap after round 12, overtime halves every 3 rounds after 24
  const gapBefore = (i: number) => i === 12 || (i >= 24 && (i - 24) % 3 === 0);
  const row = (team: TeamKey, name: string) => (
    <div className="flex items-center gap-1">
      <div className={cn('w-24 sm:w-28 shrink-0 pr-2 text-xs font-bold truncate', TEAM_TEXT[team])}>{name}</div>
      {numbers.map((i) => {
        const r = byRound.get(i);
        const won = r?.winner === team;
        return (
          <React.Fragment key={i}>
            {gapBefore(i) && <div className="w-px h-7 mx-1 bg-gray-700 shrink-0" />}
            <div
              title={r ? `${t('Раунд', 'Round')} ${i + 1}: ${r.side === 'ct' ? 'CT' : 'T'}, ${reasonText(r.reason)[lang]}` : `${t('Раунд', 'Round')} ${i + 1}`}
              className={cn(
                'flex-1 min-w-[18px] max-w-[34px] h-7 rounded-md border flex items-center justify-center',
                won ? TEAM_CELL[team] : r ? 'border-gray-800/60 bg-background/30' : 'border-gray-800/40 bg-transparent',
              )}
            >
              {won && <ReasonIcon reason={r!.reason} />}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
  return (
    <section className={cn(card, 'p-4 sm:p-6')}>
      <CardHeader icon={<Swords size={18} />} title={t('История раундов', 'Round history')} subtitle={t('значок: как выигран раунд', 'icon: how the round was won')} className="mb-4" />
      <div className="overflow-x-auto pb-1">
        <div className="space-y-1.5 min-w-[560px]">
          {row('team1', t1)}
          {row('team2', t2)}
          <div className="flex items-center gap-1">
            <div className="w-24 sm:w-28 shrink-0" />
            {numbers.map((i) => (
              <React.Fragment key={i}>
                {gapBefore(i) && <div className="w-px mx-1 shrink-0" />}
                <div className="flex-1 min-w-[18px] max-w-[34px] text-center text-[9px] text-gray-600 font-bold tabular-nums">{i + 1}</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type SortKey = 'kills' | 'deaths' | 'assists' | 'diff' | 'adr' | 'hs' | 'kast' | 'damage' | 'clutches';

function playerRow(p: { steamid: string; name: string; stats: Stats }) {
  const s = p.stats;
  const kills = s.kills ?? 0;
  const deaths = s.deaths ?? 0;
  return {
    key: p.steamid || p.name,
    name: p.name,
    steamid: p.steamid,
    kills,
    deaths,
    assists: s.assists ?? 0,
    diff: kills - deaths,
    adr: s.rounds_played ? Math.round((s.damage ?? 0) / s.rounds_played) : 0,
    hs: kills ? Math.round(((s.headshot_kills ?? 0) / kills) * 100) : 0,
    kast: s.rounds_played ? Math.round(((s.kast ?? 0) / s.rounds_played) * 100) : 0,
    damage: s.damage ?? 0,
    clutches: (s['1v1'] ?? 0) + (s['1v2'] ?? 0) + (s['1v3'] ?? 0) + (s['1v4'] ?? 0) + (s['1v5'] ?? 0),
  };
}

function PlayersTable({ team, teamKey }: { team: LiveTeam; teamKey: TeamKey }) {
  const { t } = useT();
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({ key: 'kills', desc: true });
  const rows = team.players.map(playerRow).sort((a, b) => {
    const d = (a[sort.key] - b[sort.key]) * (sort.desc ? -1 : 1);
    return d || b.damage - a.damage;
  });
  const columns: { key: SortKey; label: string; title?: string }[] = [
    { key: 'kills', label: 'K', title: t('Убийства', 'Kills') },
    { key: 'deaths', label: 'D', title: t('Смерти', 'Deaths') },
    { key: 'assists', label: 'A', title: t('Ассисты', 'Assists') },
    { key: 'diff', label: '+/-', title: t('Убийства минус смерти', 'Kills minus deaths') },
    { key: 'adr', label: 'ADR', title: t('Средний урон за раунд', 'Average damage per round') },
    { key: 'hs', label: 'HS%', title: t('Доля убийств в голову', 'Headshot kills') },
    { key: 'kast', label: 'KAST', title: t('Раунды с убийством, ассистом, выживанием или разменом', 'Rounds with a kill, assist, survival or trade') },
    { key: 'damage', label: t('Урон', 'DMG'), title: t('Весь урон', 'Total damage') },
    { key: 'clutches', label: t('Клатчи', '1vX'), title: t('Выигранные клатчи 1vX', 'Clutches won (1vX)') },
  ];
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));

  return (
    <section className={cn(card, 'overflow-hidden min-w-0')}>
      <div className="px-4 sm:px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center text-xs font-black shrink-0', TEAM_CHIP[teamKey])}>{initials(team.name || '?')}</div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-white truncate">{team.name || (teamKey === 'team1' ? t('Команда 1', 'Team 1') : t('Команда 2', 'Team 2'))}</h3>
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{t('игроков', 'players')}: {rows.length}</p>
          </div>
        </div>
        <span className={cn('shrink-0 text-2xl font-black tabular-nums', TEAM_TEXT[teamKey])}>{team.score}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[680px]">
          <thead>
            <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
              <th className="px-4 sm:px-6 py-4 border-b border-gray-800/50">{t('Игрок', 'Player')}</th>
              {columns.map((c, i) => (
                <th key={c.key} title={c.title} className={cn('px-3 py-4 border-b border-gray-800/50 text-right', i === columns.length - 1 && 'pr-4 sm:pr-6')}>
                  <button onClick={() => toggle(c.key)} className={cn('inline-flex items-center gap-0.5 uppercase hover:text-white transition-colors', sort.key === c.key && 'text-white')}>
                    {c.label}
                    {sort.key === c.key && (sort.desc ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/30">
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-6 py-12 text-center text-sm text-gray-500">{t('Статистика появится после первого раунда', 'Stats appear after the first round')}</td></tr>
            )}
            {rows.map((p) => (
              <tr key={p.key} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 sm:px-6 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn('w-9 h-9 shrink-0 rounded-xl bg-gray-800 flex items-center justify-center text-xs font-bold border border-gray-700', TEAM_TEXT[teamKey])}>{p.name.charAt(0).toUpperCase() || '?'}</div>
                    <div className="min-w-0">
                      <span className="font-bold text-white text-sm block truncate max-w-[12rem]">{p.name}</span>
                      {p.steamid && <span className="text-[10px] text-primary font-mono opacity-60">{p.steamid}</span>}
                    </div>
                  </div>
                </td>
                <Num className="font-bold text-white">{p.kills}</Num>
                <Num>{p.deaths}</Num>
                <Num>{p.assists}</Num>
                <Num className={cn('font-bold', p.diff > 0 ? 'text-green-500' : p.diff < 0 ? 'text-red-500' : 'text-gray-500')}>{p.diff > 0 ? `+${p.diff}` : p.diff}</Num>
                <Num>{p.adr}</Num>
                <Num>{p.hs}%</Num>
                <Num>{p.kast}%</Num>
                <Num>{p.damage}</Num>
                <Num className="pr-4 sm:pr-6">{p.clutches}</Num>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-3 py-3 text-right text-sm font-mono tabular-nums text-gray-300', className)}>{children}</td>;
}
