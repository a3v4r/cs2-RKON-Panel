"use client";

import React from 'react';
import { Download, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface UpdateInfo {
  running: boolean;
  phase: string;
  progress: number | null;
  attempt: number;
  startedAt?: number;
  finishedAt?: number;
  ok?: boolean;
  message?: string;
  log: string[];
  cs2Dir: string;
  steamcmd: string;
  steamcmdFound: boolean;
}

// "Update CS2": steamcmd app_update 730 validate into the server folder, as the kit's update.bat
export function Cs2UpdateModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [info, setInfo] = React.useState<UpdateInfo | null>(null);
  const [error, setError] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const logRef = React.useRef<HTMLDivElement>(null);
  const { t } = useT();

  const load = React.useCallback(() => api<UpdateInfo>('/api/cs2-update').then(setInfo).catch(() => {}), []);

  React.useEffect(() => {
    if (!open) return;
    setError('');
    load();
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  }, [open, load]);

  React.useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [info?.log.length]);

  const send = async (action: 'start' | 'cancel') => {
    if (action === 'cancel' && !confirm(t('Отменить обновление? Скачанное сохранится, следующее обновление докачает остальное.', 'Cancel the update? Downloaded files are kept, the next update fetches the rest.'))) return;
    setSending(true);
    setError('');
    try {
      setInfo(await api<UpdateInfo>('/api/cs2-update', { body: { action } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const running = info?.running ?? false;
  const finished = !running && info?.finishedAt;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[92dvh] overflow-y-auto border-border text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/15 text-primary"><Download size={16} /></span>
            {t('Обновление CS2', 'CS2 update')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('steamcmd скачает свежую версию выделенного сервера в папку серверов и проверит файлы. Metamod панель подключит сама.', 'steamcmd downloads the latest dedicated server build into the servers folder and validates the files. The panel hooks up Metamod itself.')}
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {info && (
            <div className="grid gap-2 text-xs">
              <PathRow label={t('Сервер CS2', 'CS2 server')} value={info.cs2Dir} />
              <PathRow label="steamcmd" value={info.steamcmd} bad={!info.steamcmdFound} />
            </div>
          )}

          {!running && !finished && (
            <div className="flex gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-sm text-amber-200">
              <AlertTriangle size={18} className="shrink-0 text-amber-400" />
              <span>{t('Перед обновлением остановите все серверы CS2 на этом ПК. Первое скачивание занимает ~75 ГБ, обычное обновление быстрее.', 'Stop all CS2 servers on this PC before updating. The first download is ~75 GB, regular updates are faster.')}</span>
            </div>
          )}

          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-medium text-red-400">{error}</div>}

          {info && (running || finished) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-white">{running ? info.phase || t('Обновление', 'Updating') : info.ok ? t('Готово', 'Done') : t('Не удалось', 'Failed')}</span>
                <span className="tabular-nums text-muted-foreground">
                  {info.progress !== null ? `${info.progress.toFixed(1)}%` : running ? t(`попытка ${info.attempt}`, `attempt ${info.attempt}`) : ''}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                {info.progress === null && running ? (
                  <div className="h-full w-1/3 rounded-full bg-primary/70 animate-pulse" />
                ) : (
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', finished && !info.ok ? 'bg-red-500' : finished ? 'bg-emerald-500' : 'bg-primary')}
                    style={{ width: `${info.progress ?? 0}%` }}
                  />
                )}
              </div>
              {finished && info.message && (
                <div className={cn('flex items-start gap-2 p-3 rounded-xl text-sm', info.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300')}>
                  {info.ok ? <CheckCircle2 size={18} className="shrink-0" /> : <XCircle size={18} className="shrink-0" />}
                  {info.message}
                </div>
              )}
            </div>
          )}

          {info && info.log.length > 0 && (
            <div ref={logRef} className="max-h-48 overflow-auto rounded-xl border border-border bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {info.log.slice(-80).map((line, i) => <div key={i} className="break-all">{line}</div>)}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {running ? (
              <button
                onClick={() => send('cancel')}
                disabled={sending}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-50"
              >
                {t('Отменить', 'Cancel')}
              </button>
            ) : (
              <>
                <button onClick={() => onOpenChange(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-white hover:bg-white/5">
                  {t('Закрыть', 'Close')}
                </button>
                <button
                  onClick={() => send('start')}
                  disabled={sending || !info?.steamcmdFound}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Download size={16} />
                  {finished ? t('Обновить ещё раз', 'Update again') : t('Обновить', 'Update')}
                </button>
              </>
            )}
          </div>
          {running && <p className="text-xs text-muted-foreground text-right">{t('Окно можно закрыть: обновление продолжится, прогресс виден при повторном открытии.', 'You can close this window: the update keeps running, and progress shows when you reopen it.')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PathRow({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  const { t } = useT();
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/5 min-w-0">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('flex-1 min-w-0 font-mono break-all', bad ? 'text-red-400' : 'text-white')}>{value}</span>
      {bad && <span className="shrink-0 text-red-400 font-semibold">{t('не найден', 'not found')}</span>}
    </div>
  );
}
