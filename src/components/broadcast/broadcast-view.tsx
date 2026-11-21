"use client";

import React from 'react';
import { Copy, Check, Pause, Play, Radio, LogOut, Tv, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, BroadcastRequest } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { useT, pick, Text } from '@/lib/i18n';
import { LanguageMenu } from '@/components/layout/language-menu';

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
  request: BroadcastRequest | null;
  match: null | {
    state: string;
    paused: boolean;
    mapNumber: number;
    round: number;
    team1: Team | null;
    team2: Team | null;
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

// A judge's answer stays visible this long
const ANSWER_VISIBLE_MS = 60_000;

export function BroadcastView() {
  const { t } = useT();
  const [servers, setServers] = React.useState<BroadcastServer[] | null>(null);
  const [error, setError] = React.useState('');

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
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="min-h-[100dvh] bg-background text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
        <div className="flex items-center gap-2 font-bold">
          <Radio size={18} className="text-red-500" />
          {t('Трансляция', 'Broadcast')}
        </div>
        <div className="flex items-center gap-2">
          <LanguageMenu />
          <button
            onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}
            className="p-2 rounded-md text-muted-foreground hover:bg-white/5 hover:text-white"
            aria-label={t('Выйти', 'Log out')}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      <main className="grid gap-4 p-4 md:grid-cols-2">
        {servers === null && <p className="text-muted-foreground">{t('Загрузка...', 'Loading...')}</p>}
        {servers?.length === 0 && <p className="text-muted-foreground">{t('Серверов пока нет.', 'No servers yet.')}</p>}
        {servers?.map((s) => <ServerCard key={s.id} server={s} onChange={load} />)}
      </main>
    </div>
  );
}

function ServerCard({ server: s, onChange }: { server: BroadcastServer; onChange: () => void }) {
  const { t, lang } = useT();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const m = s.match;
  const r = s.request;
  const pending = r?.status === 'pending';
  const stateLabel = m ? (m.paused ? t('ПАУЗА', 'PAUSED') : (STATE_LABELS[m.state] ? pick(STATE_LABELS[m.state], lang) : m.state)) : t('Матч не загружен', 'No match loaded');
  const canRequestPause = s.online && !!m && !m.paused && !pending && ['knife', 'going_live', 'live'].includes(m.state);
  const canRequestContinue = s.online && !!m?.paused && !pending;

  const send = async (type: 'pause' | 'unpause') => {
    setBusy(true);
    setError('');
    try {
      await api('/api/requests', { body: { serverId: s.id, type } });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!r) return;
    setBusy(true);
    try {
      await api(`/api/requests/${r.id}`, { body: { decision: 'cancel' } });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold truncate">{s.name}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {s.online ? `${s.map} • ${t('игроков', 'players')}: ${s.players}` : t('Сервер недоступен', 'Server unavailable')}
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
              {t('серия', 'series')} {m.team1.series}:{m.team2.series} • {t('карта', 'map')} {m.mapNumber + 1}
            </div>
          </div>
          <TeamBlock team={m.team2} align="right" />
        </div>
      )}

      <div className="space-y-2">
        <ConnectRow label={t('Игра', 'Game')} value={s.connect} />
        {s.gotv && <ConnectRow label="GOTV" value={s.gotv} icon={<Tv size={14} />} />}
      </div>

      <RequestStatus request={r} busy={busy} onCancel={cancel} />

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={busy || !canRequestPause}
          onClick={() => send('pause')}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm font-bold text-amber-400 disabled:opacity-40"
        >
          <Pause size={18} /> {t('Запросить паузу', 'Request pause')}
        </button>
        <button
          disabled={busy || !canRequestContinue}
          onClick={() => send('unpause')}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-sm font-bold text-emerald-400 disabled:opacity-40"
        >
          <Play size={18} /> {t('Можно продолжать', 'Ready to resume')}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  );
}

function RequestStatus({ request: r, busy, onCancel }: { request: BroadcastRequest | null; busy: boolean; onCancel: () => void }) {
  const { t } = useT();
  if (!r) return null;
  const isPause = r.type === 'pause';
  if (r.status === 'pending') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
        <span className="flex-1">{isPause
          ? t('Запрос на паузу отправлен, ждём судью...', 'Pause request sent, waiting for the referee...')
          : t('Запрос на продолжение отправлен, ждём судью...', 'Resume request sent, waiting for the referee...')}</span>
        <button disabled={busy} onClick={onCancel} className="flex items-center gap-1 text-xs text-muted-foreground disabled:opacity-50">
          <X size={14} /> {t('Отменить', 'Cancel')}
        </button>
      </div>
    );
  }
  if (!r.resolvedAt || Date.now() - new Date(r.resolvedAt).getTime() > ANSWER_VISIBLE_MS) return null;
  const text = r.status === 'accepted'
    ? (isPause ? t('Судья поставил паузу', 'The referee paused the match') : t('Судья продолжил матч', 'The referee resumed the match'))
    : r.status === 'rejected'
      ? (isPause ? t('Судья отклонил запрос на паузу', 'The referee declined the pause request') : t('Судья отклонил запрос на продолжение', 'The referee declined the resume request'))
      : t('Запрос отменён', 'Request cancelled');
  return (
    <div className={cn(
      'rounded-lg px-3 py-2 text-sm',
      r.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-muted-foreground',
    )}>
      {text}
    </div>
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
  const { t } = useT();
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</span>
      <code className="flex-1 min-w-0 truncate rounded bg-black/40 px-2 py-1.5 text-xs">{value}</code>
      <button
        onClick={async () => { await copyText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-white/5 hover:text-white"
        aria-label={t(`Скопировать ${label}`, `Copy ${label}`)}
      >
        {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
      </button>
    </div>
  );
}
