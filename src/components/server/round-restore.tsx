"use client";

import React from 'react';
import { History, Play, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { sendRconCommand } from '@/lib/rcon';
import { useConfirm } from '@/components/ui/confirm';

export interface Backup {
  round: number;
  time: string;
  team1Score: number;
  team2Score: number;
}

// MatchZy round restore. The list comes from the backups on the game server, so it works for any match MatchZy
// runs, not only for matches launched from the panel. Used on the Match tab and among the quick actions.
export function RoundRestore({ serverId, paused = false, round, onDone }: {
  serverId: number;
  paused?: boolean;
  round?: number;
  onDone?: () => void;
}) {
  const [backups, setBackups] = React.useState<Backup[] | null>(null);
  const [matchLive, setMatchLive] = React.useState<boolean | null>(null);
  const [selected, setSelected] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const confirmDialog = useConfirm();

  const loadBackups = React.useCallback(async () => {
    try {
      const data = await api<{ live?: boolean; backups: Backup[] }>(`/api/servers/${serverId}/restore`);
      setBackups(data.backups);
      setMatchLive(data.live ?? null);
      // By default the start of the current round
      setSelected((prev) => (data.backups.some((b) => String(b.round) === prev) ? prev : data.backups.length ? String(data.backups[data.backups.length - 1].round) : ''));
      setMessage(null);
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
    const ok = await confirmDialog({
      title: `Откатить к началу раунда ${backup.round + 1}?`,
      description: `Счёт станет ${backup.team1Score}:${backup.team2Score}, всё после этого раунда пропадёт. Матч встанет на паузу.`,
      confirmLabel: 'Откатить',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/servers/${serverId}/restore`, { body: { round: backup.round } });
      setMessage({ ok: true, text: `Откат к раунду ${backup.round + 1} выполнен, матч на паузе. Когда игроки готовы - снимите паузу.` });
      setTimeout(() => onDone?.(), 1500);
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
      setTimeout(() => onDone?.(), 1000);
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold"><History size={13} className="text-primary" /> Откат раунда (MatchZy)</h3>
        <div className="flex gap-1.5">
          {paused && (
            <button onClick={unpause} disabled={busy} className="flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50">
              <Play size={11} /> Снять паузу
            </button>
          )}
          <button onClick={loadBackups} disabled={busy} className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10 disabled:opacity-50">
            <RefreshCw size={11} /> {backups ? 'Обновить' : 'Выбрать раунд'}
          </button>
        </div>
      </div>
      {matchLive === false && backups?.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Матч не загружен: откатывать нечего.</p>
      )}
      {matchLive !== false && backups && (backups.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">На этой карте ещё нет точек отката.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-0 flex-1 rounded border border-border bg-[#09090b] px-2 py-1 text-xs"
          >
            {[...backups].reverse().map((b) => (
              <option key={b.round} value={b.round}>
                Начало раунда {b.round + 1} • счёт {b.team1Score}:{b.team2Score} • {b.time}
              </option>
            ))}
          </select>
          <button onClick={restore} disabled={busy || !selected} className="rounded bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/25 disabled:opacity-50">
            Откатить
          </button>
        </div>
      ))}
      {message && <p className={cn('text-[11px]', message.ok ? 'text-emerald-400' : 'text-red-400')}>{message.text}</p>}
    </section>
  );
}
