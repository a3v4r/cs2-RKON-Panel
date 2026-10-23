"use client";

import React from 'react';
import { History, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/confirm';

interface BackupFile {
  file: string;
  round: number | null;
}

// Round restore on a vanilla CS2 server: the game's own mp_backup_restore files.
export function VanillaRoundRestore({ serverId }: { serverId: number }) {
  const [files, setFiles] = React.useState<BackupFile[] | null>(null);
  const [selected, setSelected] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const confirmDialog = useConfirm();

  const loadFiles = React.useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const data = await api<{ files: BackupFile[] }>(`/api/servers/${serverId}/backup`);
      setFiles(data.files);
      // By default the newest backup
      setSelected((prev) => (data.files.some((f) => f.file === prev) ? prev : data.files[0]?.file ?? ''));
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, [serverId]);

  const restore = async () => {
    const backup = files?.find((f) => f.file === selected);
    if (!backup) return;
    const label = backup.round !== null ? `к началу раунда ${backup.round + 1}` : `из файла ${backup.file}`;
    const ok = await confirmDialog({
      title: `Откатить ${label}?`,
      description: 'Восстановятся счёт, деньги и статистика на момент этой резервной копии. Матч встанет на паузу.',
      confirmLabel: 'Откатить',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/servers/${serverId}/backup`, { body: { file: backup.file } });
      setMessage({ ok: true, text: `Откат выполнен, матч на паузе. Когда игроки готовы - снимите паузу.` });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold"><History size={13} className="text-primary" /> Откат раунда (Vanilla)</h3>
        <button onClick={loadFiles} disabled={busy} className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10 disabled:opacity-50">
          <RefreshCw size={11} /> {files ? 'Обновить' : 'Выбрать раунд'}
        </button>
      </div>
      {files && (files.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Резервных копий раундов на сервере нет.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-0 flex-1 rounded border border-border bg-[#09090b] px-2 py-1 text-xs"
          >
            {files.map((f) => (
              <option key={f.file} value={f.file}>
                {f.round !== null ? `Начало раунда ${f.round + 1} • ${f.file}` : f.file}
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
