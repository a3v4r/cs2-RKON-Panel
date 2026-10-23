"use client";

import React from 'react';
import { AlertTriangle, Loader2, RefreshCw, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

// Mirrors the response of /api/servers/[id]/players (see server/players.ts)
export interface ServerPlayer {
  userid: number | null;
  name: string;
  steamid: string | null;
  uniqueid: string;
  bot: boolean;
  ping: number | null;
  loss: number | null;
  state: string;
  connectedSeconds: number | null;
  team: 'team1' | 'team2' | null;
  side: 'ct' | 't' | null;
}

interface PlayersResponse {
  players: ServerPlayer[];
  warning?: string | null;
  fetchedAt: number;
}

const REFRESH_MS = 5000;

const STATE_LABELS: Record<string, string> = {
  active: 'активен',
  spawning: 'спавн',
  connecting: 'подключается',
  reserved: 'резерв',
};

function stateLabel(state: string) {
  return STATE_LABELS[state] ?? (state || '—');
}

function formatConnected(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`;
}

function playersWord(count: number) {
  const ten = count % 10;
  const hundred = count % 100;
  if (ten === 1 && hundred !== 11) return 'игрок';
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return 'игрока';
  return 'игроков';
}

function botsWord(count: number) {
  const ten = count % 10;
  const hundred = count % 100;
  if (ten === 1 && hundred !== 11) return 'бот';
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return 'бота';
  return 'ботов';
}

function pingTone(ping: number | null) {
  if (ping == null || ping < 0) return 'text-muted-foreground';
  if (ping <= 60) return 'text-emerald-400';
  if (ping <= 120) return 'text-amber-400';
  return 'text-red-400';
}

export function PlayersDialog({ open, onOpenChange, serverId, serverName }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: number;
  serverName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-[#09090b] border-border text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={16} className="text-orange-500" />
            Игроки на сервере
          </DialogTitle>
          <DialogDescription className="truncate">
            {serverName} · список обновляется каждые 5 секунд
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while the dialog is open, so polling stops when it closes */}
        <PlayersBody serverId={serverId} />
      </DialogContent>
    </Dialog>
  );
}

function PlayersBody({ serverId }: { serverId: number }) {
  const [players, setPlayers] = React.useState<ServerPlayer[] | null>(null);
  const [fetchedAt, setFetchedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState('');
  const [warning, setWarning] = React.useState('');
  const [refreshing, setRefreshing] = React.useState(false);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = React.useCallback(async () => {
    try {
      const data = await api<PlayersResponse>(`/api/servers/${serverId}/players`);
      if (!alive.current) return;
      setPlayers(data.players);
      setFetchedAt(data.fetchedAt);
      setWarning(data.warning ?? '');
      setError('');
    } catch (e) {
      if (!alive.current) return;
      setError((e as Error).message);
    }
  }, [serverId]);

  usePolling(load, REFRESH_MS);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

  if (!players && !error) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-12 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        Запрашиваю список у сервера...
      </div>
    );
  }

  if (!players) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-red-500/40 bg-red-500/5 py-10 text-center">
        <AlertTriangle size={24} className="text-red-400" />
        <p className="max-w-sm px-4 text-sm text-red-300">{error}</p>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded border border-border bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10 disabled:opacity-50"
        >
          Повторить
        </button>
      </div>
    );
  }

  const humans = players.filter((player) => !player.bot);
  const bots = players.length - humans.length;
  const pings = humans
    .map((player) => player.ping)
    .filter((ping): ping is number => ping != null && ping >= 0);
  const averagePing = pings.length > 0
    ? Math.round(pings.reduce((total, ping) => total + ping, 0) / pings.length)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Summary label={`${humans.length} ${playersWord(humans.length)}`} />
        {bots > 0 && <Summary label={`${bots} ${botsWord(bots)}`} tone="text-amber-400" />}
        <Summary label={`ср. пинг ${averagePing !== null ? `${averagePing} ms` : '—'}`} />
        <div className="ml-auto flex items-center gap-2">
          <UpdatedAt at={fetchedAt} />
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Обновить список"
            className="flex items-center gap-1 rounded border border-border bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : undefined} />
            <span className="hidden sm:inline">Обновить</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
          Не удалось обновить: {error}. Показаны данные прошлого опроса.
        </div>
      )}

      {warning && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
          {warning}
        </div>
      )}

      {players.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          <Users size={22} className="opacity-50" />
          {warning ? 'Список игроков получить не удалось.' : 'На сервере нет игроков.'}
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#18181b]">
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Игрок</th>
                <th className="px-2 py-2 text-left font-semibold">Статус</th>
                <th className="px-3 py-2 text-right font-semibold">Пинг</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => {
                const connected = formatConnected(player.connectedSeconds);
                return (
                  <tr
                    key={player.userid ?? `${player.name}-${index}`}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="min-w-0 max-w-[10rem] px-3 py-2 sm:max-w-[16rem]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {player.team && <TeamBadge team={player.team} side={player.side} />}
                        <span className="truncate text-white" title={player.steamid ?? player.name}>
                          {player.name}
                        </span>
                        {player.bot && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[9px] font-bold uppercase text-amber-400">
                            бот
                          </span>
                        )}
                      </div>
                      {connected && (
                        <div className="text-[10px] text-muted-foreground" title="Сколько игрок уже на сервере">
                          в игре {connected}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          player.state === 'active' ? 'bg-emerald-500' : player.state ? 'bg-sky-400' : 'bg-muted-foreground',
                        )} />
                        <span className="text-xs text-white">{player.bot ? 'бот' : stateLabel(player.state)}</span>
                      </div>
                      {player.loss != null && player.loss > 0 && (
                        <div className="text-[10px] text-amber-400">потери {player.loss}%</div>
                      )}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', pingTone(player.ping))}>
                      {player.ping != null && player.ping >= 0 ? `${player.ping} ms` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Summary({ label, tone }: { label: string; tone?: string }) {
  return (
    <span className={cn('rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] font-semibold', tone ?? 'text-muted-foreground')}>
      {label}
    </span>
  );
}

function TeamBadge({ team, side }: { team: 'team1' | 'team2'; side: 'ct' | 't' | null }) {
  const label = side ? side.toUpperCase() : team === 'team1' ? 'T1' : 'T2';
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase leading-none',
        (side ? side === 'ct' : team === 'team1')
          ? 'bg-sky-500/15 text-sky-300'
          : 'bg-amber-500/15 text-amber-300',
      )}
      title="Команда в текущем матче"
    >
      {label}
    </span>
  );
}

function UpdatedAt({ at }: { at: number | null }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (at == null) return null;
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  return (
    <span className="hidden text-[10px] text-muted-foreground sm:inline">
      {seconds < 2 ? 'обновлено только что' : `обновлено ${seconds} с назад`}
    </span>
  );
}
