"use client";

import React from 'react';
import {
  LayoutGrid, List, Search, RefreshCw, Plus, Link2, Terminal, LayoutDashboard, SlidersHorizontal, Pencil, Trash2,
  Users, Map as MapIcon, Layers, Play, Square, RotateCcw, AlertTriangle, Cpu, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { db_helper, InstancesInfo, ProcState, ServerProfile } from '@/lib/db';
import { fetchServerInfo, ServerStatus } from '@/lib/a2s';
import { Badge } from '@/components/layout/server-switcher';
import type { Section } from '@/components/layout/sidebar';
import { Cs2UpdateModal } from './cs2-update-modal';
import { useT, tNow, Text } from '@/lib/i18n';

interface ServersViewProps {
  servers: ServerProfile[];
  canManage: boolean;
  onRefresh: () => Promise<void> | void;
  onCreate: () => void;
  onConnect: () => void;
  onEdit: (server: ServerProfile) => void;
  onDelete: (id: number) => void;
  onOpen: (id: number, section: Section) => void;
  onOpenSettings: () => void;
}

type Live = { state: 'loading' } | { state: 'online'; info: ServerStatus } | { state: 'offline' };
type Proc = InstancesInfo['states'][number];
type Action = 'start' | 'stop' | 'restart';

const VIEW_KEY = 'cs2panel.servers.view';

// The list of all servers, like "Server Instances" in Quatrix
export function ServersView({ servers, canManage, onRefresh, onCreate, onConnect, onEdit, onDelete, onOpen, onOpenSettings }: ServersViewProps) {
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = React.useState('');
  const [live, setLive] = React.useState<Record<number, Live>>({});
  const [inst, setInst] = React.useState<InstancesInfo | null>(null);
  const [busy, setBusy] = React.useState<Record<number, Action | undefined>>({});
  const [errors, setErrors] = React.useState<Record<number, string | undefined>>({});
  const [refreshing, setRefreshing] = React.useState(false);
  const [updateOpen, setUpdateOpen] = React.useState(false);
  const { t } = useT();

  React.useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === 'list') setView('list'); } catch {}
  }, []);
  const changeView = (v: 'grid' | 'list') => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  };

  const pollInfo = React.useCallback(async () => {
    await Promise.all(servers.map(async (s) => {
      const id = s.id!;
      try {
        const info = await fetchServerInfo(id);
        setLive((l) => ({ ...l, [id]: { state: 'online', info } }));
      } catch {
        setLive((l) => ({ ...l, [id]: { state: 'offline' } }));
      }
    }));
  }, [servers]);

  const pollInstances = React.useCallback(async () => {
    if (!canManage) return;
    try { setInst(await db_helper.getInstances()); } catch {}
  }, [canManage]);

  React.useEffect(() => {
    pollInfo();
    const timer = setInterval(pollInfo, 10_000);
    return () => clearInterval(timer);
  }, [pollInfo]);

  React.useEffect(() => {
    pollInstances();
    const timer = setInterval(pollInstances, 3_000);
    return () => clearInterval(timer);
  }, [pollInstances]);

  const refresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); await Promise.all([pollInfo(), pollInstances()]); } finally { setRefreshing(false); }
  };

  const act = async (id: number, action: Action) => {
    setBusy((b) => ({ ...b, [id]: action }));
    setErrors((e) => ({ ...e, [id]: undefined }));
    try {
      await db_helper.serverProcess(id, action);
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
    } finally {
      setBusy((b) => ({ ...b, [id]: undefined }));
      pollInstances();
      // A starting server answers A2S after a few seconds
      setTimeout(pollInfo, 4000);
    }
  };

  const q = filter.trim().toLowerCase();
  const shown = servers.filter((s) => !q || `${s.name} ${s.host}:${s.port}`.toLowerCase().includes(q));
  const hasManaged = servers.some((s) => s.managed);

  const itemProps = (s: ServerProfile): ItemProps => ({
    server: s,
    live: live[s.id!] ?? { state: 'loading' },
    proc: s.managed ? inst?.states[s.id!] ?? { state: 'stopped' } : undefined,
    busy: busy[s.id!],
    error: errors[s.id!],
    canManage,
    onAction: (action) => act(s.id!, action),
    onEdit,
    onDelete,
    onOpen,
  });

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in duration-500">
      {canManage && <Cs2UpdateModal open={updateOpen} onOpenChange={setUpdateOpen} />}
      {/* Toolbar: the Quatrix "Server Instances" controls (view switch, SearchInput, IconButton, Button) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-background/50 border border-gray-800 rounded-xl p-[3px] shrink-0 shadow-sm shadow-black/20 h-[34px]">
          {(['grid', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => changeView(v)}
              className={cn(
                'flex items-center justify-center px-2 rounded-lg h-full min-w-[32px] transition-all active:scale-95',
                view === v ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white hover:bg-white/5',
              )}
              aria-label={v === 'grid' ? t('Карточки', 'Cards') : t('Список', 'List')}
              title={v === 'grid' ? t('Карточки', 'Cards') : t('Список', 'List')}
            >
              {v === 'grid' ? <LayoutGrid size={16} /> : <List size={16} />}
            </button>
          ))}
        </div>
        <div className="relative group flex-1 min-w-[150px] sm:flex-none sm:w-48 lg:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-primary transition-colors" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('Найти сервер...', 'Find server...')}
            className="w-full pl-10 pr-4 py-1.5 bg-background/50 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200 placeholder-gray-600 h-[34px]"
          />
        </div>
        <button
          onClick={refresh}
          className="flex items-center justify-center transition-all active:scale-95 group p-2 rounded-xl w-[34px] h-[34px] shrink-0 bg-card border border-gray-800 hover:border-primary/50 text-gray-400 hover:text-primary shadow-xl"
          aria-label={t('Обновить', 'Refresh')}
          title={t('Обновить', 'Refresh')}
        >
          <RefreshCw className={cn('w-4 h-4 transition-transform duration-500 group-active:rotate-180', refreshing && 'animate-spin text-primary')} />
        </button>
        {canManage && (
          <div className="grid grid-cols-2 gap-3 w-full sm:flex sm:items-center sm:w-auto md:ml-auto">
            <button
              onClick={onCreate}
              className="col-span-2 flex items-center justify-center gap-2 whitespace-nowrap transition-all bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-95 px-5 py-1.5 text-sm rounded-xl font-bold h-[34px]"
            >
              <Plus size={16} />
              {t('Создать сервер', 'Create server')}
            </button>
            <button
              onClick={onConnect}
              className="flex items-center justify-center gap-2 whitespace-nowrap transition-all text-gray-400 hover:text-white hover:bg-white/5 active:scale-95 border border-gray-800 hover:border-primary/50 px-5 py-1.5 text-sm rounded-xl font-bold h-[34px]"
              title={t('Добавить сервер, запущенный не из панели (другой ПК или батник)', 'Add a server not started from the panel (another PC or a batch file)')}
            >
              <Link2 size={16} />
              {t('Подключить', 'Connect')}
            </button>
            <button
              onClick={() => setUpdateOpen(true)}
              className="flex items-center justify-center gap-2 whitespace-nowrap transition-all text-gray-400 hover:text-white hover:bg-white/5 active:scale-95 border border-gray-800 hover:border-primary/50 px-5 py-1.5 text-sm rounded-xl font-bold h-[34px]"
              title={t('Скачать свежую версию сервера CS2 через steamcmd', 'Download the latest CS2 server build via steamcmd')}
            >
              <Download size={16} />
              {t('Обновить CS2', 'Update CS2')}
            </button>
          </div>
        )}
      </div>

      {canManage && inst && !inst.cs2Found && hasManaged && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/10">
          <AlertTriangle size={20} className="text-amber-400 shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-300">{t('Сервер CS2 не найден на этом ПК', 'CS2 server not found on this PC')}</div>
            <div className="text-amber-200/70 break-all">{t('Панель ищет cs2.exe в папке', 'The panel looks for cs2.exe in')} {inst.cs2Dir}</div>
          </div>
          <button onClick={onOpenSettings} className="h-10 px-4 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 shrink-0">
            {t('Указать папку', 'Set folder')}
          </button>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Layers size={28} /></div>
          <p className="text-muted-foreground max-w-sm">{t('Серверов пока нет. Создайте первый сервер, и панель сама запустит его на этом ПК.', 'No servers yet. Create your first server and the panel will run it on this PC.')}</p>
          {canManage && (
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={onCreate} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90">
                <Plus size={16} /> {t('Создать сервер', 'Create server')}
              </button>
              <button onClick={onConnect} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-white hover:bg-white/10">
                <Link2 size={16} /> {t('Подключить существующий', 'Connect existing')}
              </button>
            </div>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t('Ничего не найдено', 'Nothing found')}</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 md:gap-4">
          {shown.map((s) => <ServerCard key={s.id} {...itemProps(s)} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card shadow-lg shadow-black/20 divide-y divide-border/60">
          {shown.map((s) => <ServerRow key={s.id} {...itemProps(s)} />)}
        </div>
      )}
    </div>
  );
}

interface ItemProps {
  server: ServerProfile;
  live: Live;
  proc?: Proc;
  busy?: Action;
  error?: string;
  canManage: boolean;
  onAction: (action: Action) => void;
  onEdit: (server: ServerProfile) => void;
  onDelete: (id: number) => void;
  onOpen: (id: number, section: Section) => void;
}

const PROC_LABEL: Record<ProcState, Text> = {
  stopped: { ru: 'остановлен', en: 'stopped' },
  starting: { ru: 'запуск', en: 'starting' },
  running: { ru: 'запущен', en: 'running' },
  stopping: { ru: 'остановка', en: 'stopping' },
  crashed: { ru: 'упал', en: 'crashed' },
};

function StatusPill({ live, proc }: { live: Live; proc?: Proc }) {
  const { t, lang } = useT();
  // For servers the panel runs, a stopped process says more than "no connection"
  const tone = proc && proc.state !== 'running'
    ? (proc.state === 'crashed' ? 'red' : proc.state === 'stopped' ? 'gray' : 'amber')
    : live.state === 'online' ? 'green' : live.state === 'offline' ? (proc ? 'amber' : 'red') : 'gray';
  const label = proc && proc.state !== 'running'
    ? PROC_LABEL[proc.state][lang]
    : live.state === 'online' ? t('онлайн', 'online') : live.state === 'offline' ? (proc ? t('загружается', 'loading') : t('нет связи', 'offline')) : t('проверка', 'checking');
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider shrink-0',
      tone === 'green' && 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      tone === 'red' && 'text-red-400 bg-red-500/10 border-red-500/20',
      tone === 'amber' && 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      tone === 'gray' && 'text-muted-foreground bg-white/5 border-white/10',
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        tone === 'green' && 'bg-emerald-400 animate-pulse',
        tone === 'red' && 'bg-red-400',
        tone === 'amber' && 'bg-amber-400 animate-pulse',
        tone === 'gray' && 'bg-muted-foreground',
      )} />
      {label}
    </span>
  );
}

function IconAction({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'p-2 rounded-lg text-muted-foreground transition-colors',
        danger ? 'hover:text-red-400 hover:bg-red-400/10' : 'hover:text-white hover:bg-white/10',
      )}
    >
      {icon}
    </button>
  );
}

// Start / stop / restart, coloured as the server buttons in Quatrix
function ProcessButtons({ proc, busy, onAction, compact }: { proc: Proc; busy?: Action; onAction: (a: Action) => void; compact?: boolean }) {
  const { t } = useT();
  const up = proc.state === 'running' || proc.state === 'starting' || proc.state === 'stopping';
  const btn = 'flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50';
  const size = compact ? 'p-2' : 'flex-1 px-3 py-2.5';
  const spin = <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
  return (
    <div className={cn('flex gap-2', !compact && 'w-full')}>
      {!up ? (
        <button disabled={!!busy} onClick={() => onAction('start')} className={cn(btn, size, 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30')} title={t('Запустить', 'Start')}>
          {busy === 'start' ? spin : <Play size={14} />}{!compact && t('Запустить', 'Start')}
        </button>
      ) : (
        <>
          <button disabled={!!busy || proc.state === 'stopping'} onClick={() => onAction('restart')} className={cn(btn, size, 'bg-white/5 border border-white/10 hover:bg-white/10 text-white')} title={t('Перезапустить', 'Restart')}>
            {busy === 'restart' ? spin : <RotateCcw size={14} />}{!compact && t('Перезапустить', 'Restart')}
          </button>
          <button
            disabled={!!busy || proc.state === 'stopping'}
            onClick={() => { if (confirm(t('Остановить сервер? Игроки и идущий матч будут отключены.', 'Stop the server? Players and the live match will be disconnected.'))) onAction('stop'); }}
            className={cn(btn, size, 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30')}
            title={t('Остановить', 'Stop')}
          >
            {busy === 'stop' || proc.state === 'stopping' ? spin : <Square size={14} />}{!compact && t('Остановить', 'Stop')}
          </button>
        </>
      )}
    </div>
  );
}

function uptimeText(startedAt?: number) {
  if (!startedAt) return '';
  const min = Math.floor((Date.now() - startedAt) / 60_000);
  return min < 60 ? tNow(`${min} мин`, `${min} min`) : tNow(`${Math.floor(min / 60)} ч ${min % 60} мин`, `${Math.floor(min / 60)} h ${min % 60} min`);
}

function ServerCard({ server, live, proc, busy, error, canManage, onAction, onEdit, onDelete, onOpen }: ItemProps) {
  const { t } = useT();
  const id = server.id!;
  const info = live.state === 'online' ? live.info : null;
  const note = error ?? (proc?.state === 'crashed' || proc?.state === 'starting' || (proc?.state === 'stopped' && proc.message) ? proc.message : undefined);
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card shadow-lg shadow-black/20 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3 p-4 md:p-5">
        <Badge server={server} large />
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-white truncate">{server.name}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <span className="font-mono truncate">{server.host}:{server.port}</span>
            {server.managed && <span className="shrink-0 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider">{t('панель', 'panel')}</span>}
          </div>
        </div>
        <StatusPill live={live} proc={proc} />
      </div>

      <div className={cn('grid gap-2 md:gap-3 px-4 md:px-5 pb-4', server.managed ? 'grid-cols-3' : 'grid-cols-2')}>
        <Stat icon={<MapIcon size={12} />} label={t('Карта', 'Map')} value={info?.map ?? '---'} />
        <Stat icon={<Users size={12} />} label={t('Игроки', 'Players')} value={info ? `${info.players.online} / ${info.players.max}` : '0 / 0'} />
        {server.managed && (
          <Stat icon={<Cpu size={12} />} label={t('Работает', 'Uptime')} value={proc?.state === 'running' ? uptimeText(proc.startedAt) || t('0 мин', '0 min') : '---'} />
        )}
      </div>

      {note && <div className={cn('mx-4 md:mx-5 mb-4 p-3 rounded-xl text-xs', proc?.state === 'starting' ? 'bg-amber-500/10 text-amber-300' : 'bg-red-500/10 text-red-300')}>{note}</div>}

      {server.managed && canManage && proc && (
        <div className="px-4 md:px-5 pb-4"><ProcessButtons proc={proc} busy={busy} onAction={onAction} /></div>
      )}

      <div className="mt-auto flex items-center gap-1 px-3 md:px-4 py-2 border-t border-border/60">
        <button
          onClick={() => onOpen(id, 'dashboard')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors"
        >
          <LayoutDashboard size={14} /> {t('Обзор', 'Overview')}
        </button>
        <IconAction icon={<Terminal size={16} />} label={t('Консоль', 'Console')} onClick={() => onOpen(id, 'console')} />
        <IconAction icon={<SlidersHorizontal size={16} />} label={t('Настройки сервера', 'Server settings')} onClick={() => onOpen(id, 'settings')} />
        {canManage && (
          <div className="ml-auto flex items-center">
            <IconAction icon={<Pencil size={16} />} label={server.managed ? t('Параметры запуска', 'Launch options') : t('Изменить', 'Edit')} onClick={() => onEdit(server)} />
            <IconAction icon={<Trash2 size={16} />} label={t('Удалить', 'Delete')} onClick={() => onDelete(id)} danger />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-2.5 md:p-3 rounded-xl bg-white/[0.03] border border-white/5 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{icon} {label}</div>
      <div className="mt-1 text-sm font-semibold text-white truncate">{value}</div>
    </div>
  );
}

function ServerRow({ server, live, proc, busy, error, canManage, onAction, onEdit, onDelete, onOpen }: ItemProps) {
  const { t } = useT();
  const id = server.id!;
  const info = live.state === 'online' ? live.info : null;
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap md:flex-nowrap items-center gap-3">
        <Badge server={server} />
        <button onClick={() => onOpen(id, 'dashboard')} className="flex-1 min-w-[140px] text-left">
          <div className="text-sm font-semibold text-white truncate">{server.name}</div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">{server.host}:{server.port}</div>
        </button>
        <div className="hidden md:block w-32 text-sm text-white truncate">{info?.map ?? '---'}</div>
        <div className="hidden md:block w-20 text-sm text-white tabular-nums">{info ? `${info.players.online} / ${info.players.max}` : '0 / 0'}</div>
        <StatusPill live={live} proc={proc} />
        {server.managed && canManage && proc && <ProcessButtons proc={proc} busy={busy} onAction={onAction} compact />}
        <div className="flex items-center">
          <IconAction icon={<Terminal size={16} />} label={t('Консоль', 'Console')} onClick={() => onOpen(id, 'console')} />
          <IconAction icon={<SlidersHorizontal size={16} />} label={t('Настройки сервера', 'Server settings')} onClick={() => onOpen(id, 'settings')} />
          {canManage && <IconAction icon={<Pencil size={16} />} label={server.managed ? t('Параметры запуска', 'Launch options') : t('Изменить', 'Edit')} onClick={() => onEdit(server)} />}
          {canManage && <IconAction icon={<Trash2 size={16} />} label={t('Удалить', 'Delete')} onClick={() => onDelete(id)} danger />}
        </div>
      </div>
      {(error || proc?.state === 'crashed') && <div className="mt-2 text-xs text-red-300">{error ?? proc?.message}</div>}
    </div>
  );
}
