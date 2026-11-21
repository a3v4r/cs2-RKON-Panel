"use client";

import React from 'react';
import { LayoutGrid, List, Search, RefreshCw, Plus, Link2, Terminal, LayoutDashboard, SlidersHorizontal, Pencil, Trash2, Users, Map as MapIcon, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServerProfile } from '@/lib/db';
import { fetchServerInfo, ServerStatus } from '@/lib/a2s';
import { Badge } from '@/components/layout/server-switcher';
import type { Section } from '@/components/layout/sidebar';

interface ServersViewProps {
  servers: ServerProfile[];
  canManage: boolean;
  onRefresh: () => Promise<void> | void;
  onConnect: () => void;
  onEdit: (server: ServerProfile) => void;
  onDelete: (id: number) => void;
  onOpen: (id: number, section: Section) => void;
}

type Live = { state: 'loading' } | { state: 'online'; info: ServerStatus } | { state: 'offline' };

const VIEW_KEY = 'cs2panel.servers.view';

// The list of all servers, like "Server Instances" in Quatrix
export function ServersView({ servers, canManage, onRefresh, onConnect, onEdit, onDelete, onOpen }: ServersViewProps) {
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = React.useState('');
  const [live, setLive] = React.useState<Record<number, Live>>({});
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === 'list') setView('list'); } catch {}
  }, []);
  const changeView = (v: 'grid' | 'list') => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  };

  const poll = React.useCallback(async () => {
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

  React.useEffect(() => {
    poll();
    const timer = setInterval(poll, 10_000);
    return () => clearInterval(timer);
  }, [poll]);

  const refresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); await poll(); } finally { setRefreshing(false); }
  };

  const q = filter.trim().toLowerCase();
  const shown = servers.filter((s) => !q || `${s.name} ${s.host}:${s.port}`.toLowerCase().includes(q));

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in duration-500">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex p-1 rounded-xl bg-white/5 border border-white/10">
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
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
          />
        </div>
        <button
          onClick={refresh}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-muted-foreground hover:text-white transition-colors"
          aria-label="Обновить"
          title="Обновить"
        >
          <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
        </button>
        {canManage && (
          <button
            onClick={onConnect}
            className="md:ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            <Link2 size={16} />
            Подключить сервер
          </button>
        )}
      </div>

      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Layers size={28} /></div>
          <p className="text-muted-foreground">Серверов пока нет. Подключите первый сервер, чтобы начать.</p>
          {canManage && (
            <button onClick={onConnect} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90">
              <Plus size={16} /> Подключить сервер
            </button>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">Ничего не найдено</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 md:gap-4">
          {shown.map((s) => (
            <ServerCard key={s.id} server={s} live={live[s.id!] ?? { state: 'loading' }} canManage={canManage} onEdit={onEdit} onDelete={onDelete} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card shadow-lg shadow-black/20 divide-y divide-border/60">
          {shown.map((s) => (
            <ServerRow key={s.id} server={s} live={live[s.id!] ?? { state: 'loading' }} canManage={canManage} onEdit={onEdit} onDelete={onDelete} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ItemProps {
  server: ServerProfile;
  live: Live;
  canManage: boolean;
  onEdit: (server: ServerProfile) => void;
  onDelete: (id: number) => void;
  onOpen: (id: number, section: Section) => void;
}

function StatusPill({ live }: { live: Live }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider shrink-0',
      live.state === 'online' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
        : live.state === 'offline' ? 'text-red-400 bg-red-500/10 border-red-500/20'
        : 'text-muted-foreground bg-white/5 border-white/10',
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', live.state === 'online' ? 'bg-emerald-400 animate-pulse' : live.state === 'offline' ? 'bg-red-400' : 'bg-muted-foreground')} />
      {live.state === 'online' ? 'онлайн' : live.state === 'offline' ? 'нет связи' : 'проверка'}
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

function ServerCard({ server, live, canManage, onEdit, onDelete, onOpen }: ItemProps) {
  const id = server.id!;
  const info = live.state === 'online' ? live.info : null;
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card shadow-lg shadow-black/20 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3 p-4 md:p-5">
        <Badge server={server} large />
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-white truncate">{server.name}</div>
          <div className="text-xs text-muted-foreground font-mono truncate">{server.host}:{server.port}</div>
        </div>
        <StatusPill live={live} />
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 md:px-5 pb-4">
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><MapIcon size={12} /> Карта</div>
          <div className="mt-1 text-sm font-semibold text-white truncate">{info?.map ?? '---'}</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Users size={12} /> Игроки</div>
          <div className="mt-1 text-sm font-semibold text-white">{info ? `${info.players.online} / ${info.players.max}` : '0 / 0'}</div>
        </div>
      </div>

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
            <IconAction icon={<Pencil size={16} />} label="Изменить" onClick={() => onEdit(server)} />
            <IconAction icon={<Trash2 size={16} />} label="Удалить" onClick={() => onDelete(id)} danger />
          </div>
        )}
      </div>
    </div>
  );
}

function ServerRow({ server, live, canManage, onEdit, onDelete, onOpen }: ItemProps) {
  const id = server.id!;
  const info = live.state === 'online' ? live.info : null;
  return (
    <div className="flex flex-wrap md:flex-nowrap items-center gap-3 px-4 py-3">
      <Badge server={server} />
      <button onClick={() => onOpen(id, 'dashboard')} className="flex-1 min-w-[140px] text-left">
        <div className="text-sm font-semibold text-white truncate">{server.name}</div>
        <div className="text-[11px] text-muted-foreground font-mono truncate">{server.host}:{server.port}</div>
      </button>
      <div className="hidden md:block w-32 text-sm text-white truncate">{info?.map ?? '---'}</div>
      <div className="hidden md:block w-20 text-sm text-white tabular-nums">{info ? `${info.players.online} / ${info.players.max}` : '0 / 0'}</div>
      <StatusPill live={live} />
      <div className="flex items-center">
        <IconAction icon={<Terminal size={16} />} label="Консоль" onClick={() => onOpen(id, 'console')} />
        <IconAction icon={<SlidersHorizontal size={16} />} label="Настройки сервера" onClick={() => onOpen(id, 'settings')} />
        {canManage && <IconAction icon={<Pencil size={16} />} label="Изменить" onClick={() => onEdit(server)} />}
        {canManage && <IconAction icon={<Trash2 size={16} />} label="Удалить" onClick={() => onDelete(id)} danger />}
      </div>
    </div>
  );
}
