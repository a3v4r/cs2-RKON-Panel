"use client";

import React from 'react';
import { Download, CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
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
  installed: boolean;
  steamcmd: string;
  steamcmdFound: boolean;
  // Matchdesk.exe only: firewall rules for it and cs2.exe
  firewall: { app: boolean; cs2: boolean | null } | null;
}

// steamcmd app_update 730 validate into the server folder; steamcmd downloaded if missing
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

  const send = async (action: 'start' | 'cancel' | 'firewall') => {
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
  // no cs2.exe yet: same steamcmd run installs it
  const install = info ? !info.installed : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[92dvh] overflow-y-auto border-border text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/15 text-primary"><Download size={16} /></span>
            {install ? t('Установка CS2', 'CS2 install') : t('Обновление CS2', 'CS2 update')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {install
              ? t('Сервера CS2 на этом ПК ещё нет. steamcmd скачает выделенный сервер в папку ниже (около 60 ГБ, это надолго). steamcmd панель скачает сама, если его нет.', 'There is no CS2 server on this PC yet. steamcmd downloads the dedicated server into the folder below (about 60 GB, this takes a while). The panel downloads steamcmd itself if it is missing.')
              : t('steamcmd скачает свежую версию выделенного сервера в папку серверов и проверит файлы. Metamod панель подключит сама.', 'steamcmd downloads the latest dedicated server build into the servers folder and validates the files. The panel hooks up Metamod itself.')}
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {info && (
            <div className="grid gap-2 text-xs">
              <PathRow label={t('Сервер CS2', 'CS2 server')} value={info.cs2Dir} />
              <PathRow label="steamcmd" value={info.steamcmd} note={info.steamcmdFound ? undefined : t('скачается', 'will be downloaded')} />
              {info.firewall && (
                <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
                  <span className="w-24 shrink-0 text-muted-foreground">{t('Брандмауэр', 'Firewall')}</span>
                  <span className={cn('flex-1 min-w-0', info.firewall.app && info.firewall.cs2 !== false ? 'text-emerald-300' : 'text-amber-300')}>
                    {info.firewall.app && info.firewall.cs2 !== false
                      ? t('Панель, сайт скинов и серверы открыты для сети', 'The panel, skins site and servers are open to the network')
                      : t('Нет правил: с других ПК не подключиться ни к панели, ни к серверам', 'Rules missing: other PCs cannot reach the panel or the servers')}
                  </span>
                  {(!info.firewall.app || info.firewall.cs2 === false) && (
                    <button
                      onClick={() => send('firewall')}
                      disabled={sending}
                      title={t('Windows спросит разрешение администратора на этом ПК', 'Windows asks for administrator permission on this PC')}
                      className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-200 font-semibold hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      <ShieldCheck size={14} />{t('Разрешить', 'Allow')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!running && !finished && (
            <div className="flex gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-sm text-amber-200">
              <AlertTriangle size={18} className="shrink-0 text-amber-400" />
              <span>{install
                ? t('Нужно минимум 85 ГБ свободного места на диске с папкой сервера. Другую папку можно выбрать в настройках («Сервер CS2»).', 'At least 85 GB of free space is needed on the server folder drive. Pick another folder in the settings ("CS2 server").')
                : t('Перед обновлением остановите все серверы CS2 на этом ПК. Первое скачивание занимает ~75 ГБ, обычное обновление быстрее.', 'Stop all CS2 servers on this PC before updating. The first download is ~75 GB, regular updates are faster.')}</span>
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
                  disabled={sending || !info}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Download size={16} />
                  {install ? t('Установить', 'Install') : finished ? t('Обновить ещё раз', 'Update again') : t('Обновить', 'Update')}
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

function PathRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/5 min-w-0">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex-1 min-w-0 font-mono break-all text-white">{value}</span>
      {note && <span className="shrink-0 text-amber-300 font-semibold">{note}</span>}
    </div>
  );
}
