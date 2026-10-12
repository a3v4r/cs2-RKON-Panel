"use client";

import React from 'react';
import { Copy, Check, Pause, Play, Radio, LogOut, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface Team {
  name: string;
  series: number;
  score: number;
  side: string;
}

interface BroadcastServer {
  id: number;
  name: string;
  online: boolean;
  map: string | null;
  hostname: string | null;
  players: number;
  connect: string;
  gotv: string | null;
  match: null | {
    state: string;
    paused: boolean;
    pausedByBroadcast: boolean;
    mapNumber: number;
    round: number;
    team1: Team | null;
    team2: Team | null;
  };
}

const STATE_LABELS: Record<string, string> = {
  pre_veto: 'Ожидание вето',
  veto: 'Вето',
  warmup: 'Разминка',
  knife: 'Ножевой раунд',
  waiting_for_knife_decision: 'Выбор стороны',
  going_live: 'Старт',
  live: 'Идёт игра',
  post_game: 'Карта окончена',
};

// Clipboard API needs HTTPS or localhost; the panel is opened over plain http on the LAN, so fall back to execCommand.
async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

export function BroadcastView({ username }: { username: string }) {
  const [servers, setServers] = React.useState<BroadcastServer[] | null>(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState<number | null>(null);
  const [notice, setNotice] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      setServers(await api<BroadcastServer[]>('/api/broadcast'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  React.useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const pauseAction = async (server: BroadcastServer, action: 'pause' | 'unpause') => {
    const question = action === 'pause'
      ? `Поставить матч на сервере «${server.name}» на паузу?`
      : `Продолжить матч на сервере «${server.name}»?`;
    if (!confirm(question)) return;
    setBusy(server.id);
    try {
      await api(`/api/servers/${server.id}/pause`, { body: { action } });
      setNotice(action === 'pause' ? 'Пауза поставлена' : 'Матч продолжается');
      setTimeout(() => setNotice(''), 4000);
      await load();
    } catch (e) {
      setNotice(`Ошибка: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#09090b] text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-[#09090b] px-4 py-3">
        <div className="flex items-center gap-2 font-bold">
          <Radio size={18} className="text-red-500" />
          Трансляция
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="truncate">{username}</span>
          <button
            onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}
            className="p-2 rounded-md hover:bg-white/5 hover:text-white"
            aria-label="Выйти"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {notice && (
        <div className="mx-4 mt-3 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">{notice}</div>
      )}
      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      <main className="grid gap-4 p-4 md:grid-cols-2">
        {servers === null && <p className="text-muted-foreground">Загрузка...</p>}
        {servers?.length === 0 && <p className="text-muted-foreground">Серверов пока нет - их добавляет админ.</p>}
        {servers?.map((s) => (
          <ServerCard key={s.id} server={s} busy={busy === s.id} onPause={pauseAction} />
        ))}
      </main>
    </div>
  );
}

function ServerCard({ server: s, busy, onPause }: {
  server: BroadcastServer;
  busy: boolean;
  onPause: (s: BroadcastServer, action: 'pause' | 'unpause') => void;
}) {
  const m = s.match;
  const stateLabel = m ? (m.paused ? 'ПАУЗА' : STATE_LABELS[m.state] ?? m.state) : 'Матч не загружен';
  // Pause only a running match; lift only a pause the broadcast set itself
  const canPause = s.online && !!m && !m.paused && ['knife', 'going_live', 'live'].includes(m.state);
  const canUnpause = s.online && !!m?.pausedByBroadcast;

  return (
    <section className="rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold truncate">{s.name}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {s.online ? `${s.map} • игроков: ${s.players}` : 'Сервер недоступен'}
          </p>
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase',
          !s.online ? 'bg-red-500/15 text-red-400'
            : m?.paused ? 'bg-amber-500/15 text-amber-400'
            : m?.state === 'live' ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-white/10 text-muted-foreground',
        )}>
          {s.online ? stateLabel : 'offline'}
        </span>
      </div>

      {m?.team1 && m?.team2 && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg bg-white/5 px-3 py-3">
          <TeamBlock team={m.team1} align="left" />
          <div className="text-center">
            <div className="text-2xl font-bold tabular-nums">{m.team1.score} : {m.team2.score}</div>
            <div className="text-[11px] text-muted-foreground">
              серия {m.team1.series}:{m.team2.series} • карта {m.mapNumber + 1}
            </div>
          </div>
          <TeamBlock team={m.team2} align="right" />
        </div>
      )}

      <div className="space-y-2">
        <ConnectRow label="Игра" value={s.connect} />
        {s.gotv && <ConnectRow label="GOTV" value={s.gotv} icon={<Tv size={14} />} />}
      </div>

      {m?.paused && !m.pausedByBroadcast && (
        <p className="text-xs text-amber-400">Паузу поставили игроки или судья - снять её может только судья.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={busy || !canPause}
          onClick={() => onPause(s, 'pause')}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 font-bold text-amber-400 disabled:opacity-40"
        >
          <Pause size={18} /> Пауза
        </button>
        <button
          disabled={busy || !canUnpause}
          onClick={() => onPause(s, 'unpause')}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 font-bold text-emerald-400 disabled:opacity-40"
        >
          <Play size={18} /> Продолжить
        </button>
      </div>
    </section>
  );
}

function TeamBlock({ team, align }: { team: Team; align: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <div className="font-semibold truncate">{team.name}</div>
      <div className={cn('text-[11px] font-bold uppercase', team.side === 'ct' ? 'text-sky-400' : 'text-amber-400')}>
        {team.side === 'ct' ? 'CT' : team.side === 't' ? 'T' : team.side}
      </div>
    </div>
  );
}

function ConnectRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</span>
      <code className="flex-1 min-w-0 truncate rounded bg-black/40 px-2 py-1.5 text-xs">{value}</code>
      <button
        onClick={async () => { await copyText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-white/5 hover:text-white"
        aria-label={`Скопировать ${label}`}
      >
        {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
      </button>
    </div>
  );
}
