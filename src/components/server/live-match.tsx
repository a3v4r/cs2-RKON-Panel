"use client";

import React from 'react';
import { Activity, Crosshair, Skull, Bomb, ShieldCheck, Timer, Flag, History, Play, RefreshCw } from 'lucide-react';
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
const TEAM_BG = { team1: 'bg-sky-500/70', team2: 'bg-amber-500/70' } as const;

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

  if (!data) return <div className="p-6 text-muted-foreground">{error || t('Загрузка...', 'Loading...')}</div>;

  const { status, live } = data;
  const t1 = status?.team1 ?? (live ? { name: live.team1.name, score: live.team1.score, series: live.team1.seriesScore, side: '' } : null);
  const t2 = status?.team2 ?? (live ? { name: live.team2.name, score: live.team2.score, series: live.team2.seriesScore, side: '' } : null);
  const stateLabel = status ? (status.paused ? t('ПАУЗА', 'PAUSED') : STATE_LABELS[status.state]?.[lang] ?? status.state) : live?.finished ? t('Матч завершён', 'Match finished') : t('Матч не загружен', 'No match loaded');

  return (
    <div className="p-3 md:p-6 space-y-4 animate-in fade-in duration-500">
      {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

      {/* Scoreboard */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-black/20">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Activity size={14} className="text-primary" /> {data.map ?? '---'}{status ? ` • ${t('карта', 'map')} ${status.mapNumber + 1}` : ''}{status && status.round >= 0 ? ` • ${t('раунд', 'round')} ${status.round + 1}` : ''}</span>
          <span className={cn(
            'rounded-full px-2 py-0.5 font-bold uppercase',
            status?.paused ? 'bg-amber-500/15 text-amber-400' : status?.state === 'live' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10',
          )}>{stateLabel}</span>
        </div>
        {t1 && t2 ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamHeader name={t1.name} side={t1.side} team="team1" />
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold tabular-nums">{t1.score} : {t2.score}</div>
              <div className="text-xs text-muted-foreground">{t('серия', 'series')} {t1.series}:{t2.series}</div>
              {status?.clock && <RoundClock clock={status.clock} paused={status.paused} receivedAt={data.receivedAt} />}
            </div>
            <TeamHeader name={t2.name} side={t2.side} team="team2" align="right" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('Запустите матч в разделе «Запуск матча» - здесь появятся счёт и статистика.', 'Start a match in the "Match launch" section - the score and stats will show up here.')}</p>
        )}
      </section>

      {status?.state === 'live' && <RoundRestore serverId={serverId} paused={status.paused} round={status.round} onDone={load} />}

      {status && !live && (
        <p className="text-xs text-muted-foreground">
          {t('Статистика игроков появится после первого раунда, если матч запущен из панели (раздел «Запуск матча»).', 'Player stats appear after the first round if the match was started from the panel ("Match launch" section).')}
        </p>
      )}

      {live && (
        <>
          {live.rounds.length > 0 && <RoundStrip rounds={live.rounds} />}

          <div className="grid gap-4 xl:grid-cols-2">
            <PlayersTable team={live.team1} teamKey="team1" />
            <PlayersTable team={live.team2} teamKey="team2" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {live.kills.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-black/20">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Crosshair size={14} className="text-primary" /> {t('Последние убийства', 'Recent kills')}</h3>
                <div className="space-y-1 text-sm">
                  {[...live.kills].reverse().slice(0, 10).map((k, i) => (
                    <div key={i} className="flex items-center gap-2 min-w-0">
                      <span className="w-8 shrink-0 text-xs text-muted-foreground">R{k.round + 1}</span>
                      <span className={cn('truncate', k.attackerTeam ? TEAM_TEXT[k.attackerTeam] : 'text-muted-foreground')}>{k.attacker ?? '---'}</span>
                      <span className="shrink-0 rounded bg-white/5 px-1.5 text-xs text-muted-foreground">{weaponName(k.weapon)}{k.headshot ? ' • HS' : ''}</span>
                      <span className={cn('truncate', k.victimTeam ? TEAM_TEXT[k.victimTeam] : '')}>{k.victim}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {live.maps.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-black/20">
                <h3 className="mb-3 text-sm font-semibold">{t('Карты серии', 'Series maps')}</h3>
                <div className="space-y-1 text-sm">
                  {live.maps.map((m) => (
                    <div key={m.mapNumber} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{t('Карта', 'Map')} {m.mapNumber + 1}{m.mapName ? ` • ${m.mapName}` : ''}</span>
                      <span className="tabular-nums">
                        <span className={m.winner === 'team1' ? 'font-bold text-sky-400' : ''}>{m.team1Score}</span>
                        {' : '}
                        <span className={m.winner === 'team2' ? 'font-bold text-amber-400' : ''}>{m.team2Score}</span>
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
  round_over: { label: { ru: 'Конец раунда', en: 'Round over' }, className: 'text-muted-foreground' },
  halftime: { label: { ru: 'Смена сторон', en: 'Halftime' }, className: 'text-muted-foreground' },
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
    <div className={cn('mt-1 flex items-center justify-center gap-1.5 text-sm font-semibold tabular-nums', phase.className)}>
      {clock.phase === 'bomb' ? <Bomb size={13} /> : <Timer size={13} />}
      <span>{phase.label[lang]}</span>
      <span>{Math.floor(whole / 60)}:{String(whole % 60).padStart(2, '0')}</span>
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
    <section className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-black/20 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><History size={14} className="text-primary" /> {t('Откат раунда', 'Round restore')}</h3>
        <div className="flex gap-2">
          {paused && (
            <button onClick={unpause} disabled={busy} className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50">
              <Play size={12} /> {t('Снять паузу', 'Unpause')}
            </button>
          )}
          <button onClick={loadBackups} disabled={busy} className="flex items-center gap-1 rounded-md bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50">
            <RefreshCw size={12} /> {backups ? t('Обновить', 'Refresh') : t('Выбрать раунд', 'Choose round')}
          </button>
        </div>
      </div>
      {backups && (backups.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('На этой карте ещё нет точек отката.', 'No round backups on this map yet.')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background/50 px-2 py-1.5 text-sm"
          >
            {[...backups].reverse().map((b) => (
              <option key={b.round} value={b.round}>
                {t('Начало раунда', 'Start of round')} {b.round + 1} • {t('счёт', 'score')} {b.team1Score}:{b.team2Score} • {b.time}
              </option>
            ))}
          </select>
          <button onClick={restore} disabled={busy || !selected} className="rounded-md bg-amber-500/15 px-3 py-1.5 text-sm font-semibold text-amber-400 hover:bg-amber-500/25 disabled:opacity-50">
            {t('Откатить', 'Restore')}
          </button>
        </div>
      ))}
      {message && <p className={cn('text-xs', message.ok ? 'text-emerald-400' : 'text-red-400')}>{message.text}</p>}
    </section>
  );
}

function TeamHeader({ name, side, team, align = 'left' }: { name: string; side: string; team: 'team1' | 'team2'; align?: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <div className={cn('text-base md:text-xl font-bold truncate', TEAM_TEXT[team])}>{name}</div>
      {side && (
        <div className={cn('text-xs font-bold uppercase', side === 'ct' ? 'text-sky-300' : 'text-amber-300')}>{side === 'ct' ? 'CT' : side === 't' ? 'T' : side}</div>
      )}
    </div>
  );
}

function RoundStrip({ rounds }: { rounds: { round: number; winner: 'team1' | 'team2'; side: string; reason: number }[] }) {
  const { t, lang } = useT();
  const sorted = [...rounds].sort((a, b) => a.round - b.round);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-black/20">
      <h3 className="mb-3 text-sm font-semibold">{t('Раунды', 'Rounds')}</h3>
      <div className="flex flex-wrap gap-1">
        {sorted.map((r) => (
          <React.Fragment key={r.round}>
            {/* MR12: sides swap after round 12, overtime halves every 3 rounds after 24 */}
            {(r.round === 12 || (r.round >= 24 && (r.round - 24) % 3 === 0)) && <div className="mx-1 w-px self-stretch bg-border" />}
            <div
              title={`${t('Раунд', 'Round')} ${r.round + 1}: ${r.side === 'ct' ? 'CT' : 'T'}, ${reasonText(r.reason)[lang]}`}
              className={cn('flex h-7 w-6 flex-col items-center justify-center rounded text-[10px] text-black', TEAM_BG[r.winner])}
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

function PlayersTable({ team, teamKey }: { team: LiveTeam; teamKey: 'team1' | 'team2' }) {
  const { t } = useT();
  const rows = [...team.players].sort((a, b) => (b.stats.kills ?? 0) - (a.stats.kills ?? 0) || (b.stats.damage ?? 0) - (a.stats.damage ?? 0));
  return (
    <section className="rounded-xl border border-border overflow-hidden">
      <div className={cn('px-4 py-2 text-sm font-bold border-b border-border', TEAM_TEXT[teamKey])}>{team.name || (teamKey === 'team1' ? t('Команда 1', 'Team 1') : t('Команда 2', 'Team 2'))}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">{t('Игрок', 'Player')}</th>
              <th className="px-2 py-2 text-right font-medium">K</th>
              <th className="px-2 py-2 text-right font-medium">D</th>
              <th className="px-2 py-2 text-right font-medium">A</th>
              <th className="px-2 py-2 text-right font-medium">±</th>
              <th className="px-2 py-2 text-right font-medium">ADR</th>
              <th className="px-2 py-2 text-right font-medium">HS%</th>
              <th className="px-2 py-2 text-right font-medium" title={t('Раунды с убийством, ассистом, выживанием или разменом', 'Rounds with a kill, assist, survival or trade')}>KAST</th>
              <th className="px-2 py-2 text-right font-medium">{t('Урон', 'Damage')}</th>
              <th className="px-3 py-2 text-right font-medium" title={t('Выигранные клатчи 1vX', 'Clutches won (1vX)')}>{t('Клатчи', 'Clutches')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-4 text-center text-xs text-muted-foreground">{t('Нет данных', 'No data')}</td></tr>
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
