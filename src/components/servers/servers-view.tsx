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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex items-center h-10 p-1 rounded-xl bg-white/5 border border-white/10">
          {(['grid', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => changeView(v)}
              className={cn('p-1.5 rounded-lg transition-colors', view === v ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white')}
              aria-label={v === 'grid' ? 'Карточки' : 'Список'}
              title={v === 'grid' ? 'Карточки' : 'Список'}
            >
              {v === 'grid' ? <LayoutGrid size={16} /> : <List size={16} />}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[160px] md:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Найти сервер..."
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
          />
        </div>
        <button
          onClick={refresh}
          className="flex items-center justify-center h-10 w-10 shrink-0 rounded-xl bg-white/5 border border-white/10 text-muted-foreground hover:text-white transition-colors"
          aria-label="Обновить"
          title="Обновить"
        >
          <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
        </button>
        {canManage && (
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:w-auto md:ml-auto">
            <button
              onClick={onCreate}
              className="col-span-2 flex-1 sm:flex-none flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              <Plus size={16} />
              Создать сервер
            </button>
            <button
              onClick={onConnect}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
              title="Добавить сервер, запущенный не из панели (другой ПК или батник)"
            >
              <Link2 size={16} />
              Подключить
            </button>
            <button
              onClick={() => setUpdateOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
              title="Скачать свежую версию сервера CS2 через steamcmd"
            >
              <Download size={16} />
              Обновить CS2
            </button>
          </div>
        )}
      </div>

      {canManage && inst && !inst.cs2Found && hasManaged && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/10">
          <AlertTriangle size={20} className="text-amber-400 shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-300">Сервер CS2 не найден на этом ПК</div>
            <div className="text-amber-200/70 break-all">Панель ищет cs2.exe в папке {inst.cs2Dir}</div>
          </div>
          <button onClick={onOpenSettings} className="h-10 px-4 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 shrink-0">
            Указать папку
          </button>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Layers size={28} /></div>
          <p className="text-muted-foreground max-w-sm">Серверов пока нет. Создайте первый сервер, и панель сама запустит его на этом ПК.</p>
          {canManage && (
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={onCreate} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90">
                <Plus size={16} /> Создать сервер
              </button>
              <button onClick={onConnect} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-white hover:bg-white/10">
                <Link2 size={16} /> Подключить существующий
              </button>
            </div>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">Ничего не найдено</p>
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

const PROC_LABEL: Record<ProcState, string> = {
  stopped: 'остановлен',
  starting: 'запуск',
  running: 'запущен',
  stopping: 'остановка',
  crashed: 'упал',
};

function StatusPill({ live, proc }: { live: Live; proc?: Proc }) {
  // For servers the panel runs, a stopped process says more than "no connection"
  const tone = proc && proc.state !== 'running'
    ? (proc.state === 'crashed' ? 'red' : proc.state === 'stopped' ? 'gray' : 'amber')
    : live.state === 'online' ? 'green' : live.state === 'offline' ? (proc ? 'amber' : 'red') : 'gray';
  const label = proc && proc.state !== 'running'
    ? PROC_LABEL[proc.state]
    : live.state === 'online' ? 'онлайн' : live.state === 'offline' ? (proc ? 'загружается' : 'нет связи') : 'проверка';
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
  const up = proc.state === 'running' || proc.state === 'starting' || proc.state === 'stopping';
  const btn = 'flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50';
  const size = compact ? 'p-2' : 'flex-1 px-3 py-2.5';
  const spin = <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
  return (
    <div className={cn('flex gap-2', !compact && 'w-full')}>
      {!up ? (
        <button disabled={!!busy} onClick={() => onAction('start')} className={cn(btn, size, 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30')} title="Запустить">
          {busy === 'start' ? spin : <Play size={14} />}{!compact && 'Запустить'}
        </button>
      ) : (
        <>
          <button disabled={!!busy || proc.state === 'stopping'} onClick={() => onAction('restart')} className={cn(btn, size, 'bg-white/5 border border-white/10 hover:bg-white/10 text-white')} title="Перезапустить">
            {busy === 'restart' ? spin : <RotateCcw size={14} />}{!compact && 'Перезапустить'}
          </button>
          <button
            disabled={!!busy || proc.state === 'stopping'}
            onClick={() => { if (confirm('Остановить сервер? Игроки и идущий матч будут отключены.')) onAction('stop'); }}
            className={cn(btn, size, 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30')}
            title="Остановить"
          >
            {busy === 'stop' || proc.state === 'stopping' ? spin : <Square size={14} />}{!compact && 'Остановить'}
          </button>
        </>
      )}
    </div>
  );
}

function uptimeText(startedAt?: number) {
  if (!startedAt) return '';
  const min = Math.floor((Date.now() - startedAt) / 60_000);
  return min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч ${min % 60} мин`;
}

function ServerCard({ server, live, proc, busy, error, canManage, onAction, onEdit, onDelete, onOpen }: ItemProps) {
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
            {server.managed && <span className="shrink-0 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider">панель</span>}
          </div>
        </div>
        <StatusPill live={live} proc={proc} />
      </div>

      <div className={cn('grid gap-2 md:gap-3 px-4 md:px-5 pb-4', server.managed ? 'grid-cols-3' : 'grid-cols-2')}>
        <Stat icon={<MapIcon size={12} />} label="Карта" value={info?.map ?? '---'} />
        <Stat icon={<Users size={12} />} label="Игроки" value={info ? `${info.players.online} / ${info.players.max}` : '0 / 0'} />
        {server.managed && (
          <Stat icon={<Cpu size={12} />} label="Работает" value={proc?.state === 'running' ? uptimeText(proc.startedAt) || '0 мин' : '---'} />
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
          <LayoutDashboard size={14} /> Обзор
        </button>
        <IconAction icon={<Terminal size={16} />} label="Консоль" onClick={() => onOpen(id, 'console')} />
        <IconAction icon={<SlidersHorizontal size={16} />} label="Настройки сервера" onClick={() => onOpen(id, 'settings')} />
        {canManage && (
          <div className="ml-auto flex items-center">
            <IconAction icon={<Pencil size={16} />} label={server.managed ? 'Параметры запуска' : 'Изменить'} onClick={() => onEdit(server)} />
            <IconAction icon={<Trash2 size={16} />} label="Удалить" onClick={() => onDelete(id)} danger />
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
          <IconAction icon={<Terminal size={16} />} label="Консоль" onClick={() => onOpen(id, 'console')} />
          <IconAction icon={<SlidersHorizontal size={16} />} label="Настройки сервера" onClick={() => onOpen(id, 'settings')} />
          {canManage && <IconAction icon={<Pencil size={16} />} label={server.managed ? 'Параметры запуска' : 'Изменить'} onClick={() => onEdit(server)} />}
          {canManage && <IconAction icon={<Trash2 size={16} />} label="Удалить" onClick={() => onDelete(id)} danger />}
        </div>
      </div>
      {(error || proc?.state === 'crashed') && <div className="mt-2 text-xs text-red-300">{error ?? proc?.message}</div>}
    </div>
  );
}
