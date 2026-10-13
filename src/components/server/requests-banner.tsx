"use client";

import React from 'react';
import { Radio, Pause, Play, X } from 'lucide-react';
import { api, BroadcastRequest } from '@/lib/api';

// Short beep + vibration so a judge notices a broadcast request even with the phone in hand.
function signal() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // audio is blocked until the user interacts with the page
  }
  navigator.vibrate?.([200, 100, 200]);
}

// Pending broadcast requests for the judges, shown above every tab.
export function RequestsBanner() {
  const [pending, setPending] = React.useState<BroadcastRequest[]>([]);
  const [busy, setBusy] = React.useState<number | null>(null);
  const [error, setError] = React.useState('');
  const seen = React.useRef<Set<number>>(new Set());

  const load = React.useCallback(async () => {
    try {
      const list = (await api<BroadcastRequest[]>('/api/requests')).filter((r) => r.status === 'pending');
      if (list.some((r) => !seen.current.has(r.id))) signal();
      list.forEach((r) => seen.current.add(r.id));
      setPending(list);
    } catch {
      // keep the last state; the next poll retries
    }
  }, []);

  React.useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  const decide = async (request: BroadcastRequest, decision: 'accept' | 'reject') => {
    setBusy(request.id);
    setError('');
    try {
      await api(`/api/requests/${request.id}`, { body: { decision } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (pending.length === 0) return null;

  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 px-3 md:px-6 py-2 space-y-2">
      {pending.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2">
          <Radio size={16} className="shrink-0 text-red-500 animate-pulse" />
          <div className="flex-1 min-w-[12rem] text-sm">
            <span className="font-bold">Трансляция</span>{' '}
            {r.type === 'pause' ? 'просит паузу' : 'готова, просит продолжить матч'} на{' '}
            <span className="font-bold">{r.serverName}</span>
            {r.reason && <span className="text-amber-200">: {r.reason}</span>}
          </div>
          <button
            disabled={busy === r.id}
            onClick={() => decide(r, 'accept')}
            className="flex h-9 items-center gap-1 rounded-md bg-amber-500 px-3 text-sm font-bold text-black disabled:opacity-50"
          >
            {r.type === 'pause' ? <><Pause size={14} /> Поставить паузу</> : <><Play size={14} /> Продолжить матч</>}
          </button>
          <button
            disabled={busy === r.id}
            onClick={() => decide(r, 'reject')}
            className="flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm disabled:opacity-50"
          >
            <X size={14} /> Отклонить
          </button>
        </div>
      ))}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
