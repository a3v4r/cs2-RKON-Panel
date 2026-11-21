"use client";

import React from 'react';
import {
  LayoutGrid, List, Search, RefreshCw, Plus, Link2, Download, Users, Hash, Play, Square, Terminal, Settings,
  Copy, Check, Trash2, RotateCcw, Pencil, Shield, AlertTriangle, CheckCircle2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { db_helper, InstancesInfo, ServerProfile } from '@/lib/db';
import { fetchServerInfo, ServerStatus } from '@/lib/a2s';
import { copyText } from '@/lib/clipboard';
import type { Section } from '@/components/layout/sidebar';
import { useT } from '@/lib/i18n';
import { Cs2UpdateModal } from './cs2-update-modal';

// Server Instances, ported from the Quatrix Instances page with its ServerCard and ServerRow.
// Servers the panel starts itself have Start / Stop / Restart; servers connected by address are marked Remote.

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
type Status = 'ONLINE' | 'OFFLINE' | 'STARTING' | 'STOPPING' | 'CRASHED' | 'CHECKING';

const VIEW_KEY = 'cs2panel.servers.view';

const MAP_IMAGES: Record<string, string> = {
  de_dust2: 'de_dust2', de_mirage: 'de_mirage', de_inferno: 'de_inferno', de_nuke: 'de_nuke_cs2', de_ancient: 'de_ancient',
  de_anubis: 'de_anubis', de_vertigo: 'de_vertigo', de_overpass: 'de_overpass', de_train: 'de_train',
  cs_italy: 'de_italy', de_italy: 'de_italy', cs_office: 'de_office', de_office: 'de_office',
};
// The Quatrix getMapImage: stock maps by name (also inside workshop paths), anything else gets a default picture
export function mapImage(map?: string | null) {
  const name = (map ?? '').split(/[/\\]/).pop()?.replace(/\.(vpk|bsp)$/i, '').toLowerCase() ?? '';
  return `/images/maps/${MAP_IMAGES[name] ?? 'de_dust2'}.webp`;
}

function statusOf(live: Live, proc?: Proc): Status {
  if (proc) {
    if (proc.state === 'crashed') return 'CRASHED';
    if (proc.state === 'stopped') return 'OFFLINE';
    if (proc.state === 'starting') return 'STARTING';
    if (proc.state === 'stopping') return 'STOPPING';
    return live.state === 'online' ? 'ONLINE' : 'STARTING'; // the process runs, CS2 is still loading
  }
  return live.state === 'online' ? 'ONLINE' : live.state === 'offline' ? 'OFFLINE' : 'CHECKING';
}

const btn = 'flex items-center justify-center gap-2 whitespace-nowrap transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
const iconBtn = 'flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group p-2 rounded-xl w-[34px] h-[34px] shrink-0';

export function ServersView({ servers, canManage, onRefresh, onCreate, onConnect, onEdit, onDelete, onOpen, onOpenSettings }: ServersViewProps) {
  const { t } = useT();
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = React.useState('');
  const [live, setLive] = React.useState<Record<number, Live>>({});
  const [inst, setInst] = React.useState<InstancesInfo | null>(null);
  const [busy, setBusy] = React.useState<Record<number, Action | undefined>>({});
  const [copied, setCopied] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [updateOpen, setUpdateOpen] = React.useState(false);
  const [toast, setToast] = React.useState<{ ok: boolean; text: string } | null>(null);

  const notify = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 4000);
  };

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
    if (action === 'stop' && !confirm(t('Остановить сервер? Игроки и идущий матч будут отключены.', 'Stop the server? Players and a running match will be disconnected.'))) return;
    setBusy((b) => ({ ...b, [id]: action }));
    try {
      await db_helper.serverProcess(id, action);
      notify(true, action === 'start' ? t('Сервер запускается', 'Server is booting up') : action === 'stop' ? t('Сервер остановлен', 'Server stopped') : t('Сервер скоро будет онлайн', 'Server will be online shortly'));
    } catch (err) {
      notify(false, (err as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [id]: undefined }));
      pollInstances();
      setTimeout(pollInfo, 4000);
    }
  };

  const copy = async (text: string, id: string) => {
    try {
      await copyText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
      notify(true, t('Адрес скопирован', 'Address copied to clipboard'));
    } catch {
      notify(false, t('Не удалось скопировать', 'Failed to copy to clipboard'));
    }
  };

  const q = filter.trim().toLowerCase();
  const shown = servers.filter((s) => {
    const info = live[s.id!];
    const map = info?.state === 'online' ? info.info.map : '';
    return !q || `${s.name} ${s.host}:${s.port} ${map} ${s.id}`.toLowerCase().includes(q);
  });
  const hasManaged = servers.some((s) => s.managed);

  const itemProps = (s: ServerProfile): ItemProps => {
    const l = live[s.id!] ?? { state: 'loading' };
    const proc = s.managed ? inst?.states[s.id!] ?? { state: 'stopped' as const } : undefined;
    return {
      server: s,
      info: l.state === 'online' ? l.info : null,
      status: statusOf(l, proc),
      statusNote: proc?.message,
      busy: busy[s.id!],
      copied,
      canManage,
      onAction: (a) => act(s.id!, a),
      onCopy: copy,
      onEdit,
      onDelete,
      onOpen,
    };
  };

  return (
    <div className="p-3 md:p-6 min-h-full flex flex-col">
      {canManage && <Cs2UpdateModal open={updateOpen} onOpenChange={setUpdateOpen} />}
      <div className="flex-1">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{t('Серверы', 'Server Instances')}</h2>
            <p className="text-sm text-gray-400 mt-1">{t('Запуск, мониторинг и настройка серверов CS2 в реальном времени.', 'Manage and monitor your dedicated CS2 server instances in real-time.')}</p>
          </div>
          <div className="flex flex-wrap lg:flex-nowrap items-center gap-3 shrink-0">
            <div className="flex bg-background/50 border border-gray-800 rounded-xl p-[3px] shrink-0 shadow-sm shadow-black/20 h-[34px]">
              {(['grid', 'list'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => changeView(v)}
                  className={cn('flex items-center justify-center px-2 rounded-lg h-full min-w-[32px] transition-all', view === v ? 'bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary' : 'text-gray-400 hover:text-white hover:bg-white/5')}
                  title={v === 'grid' ? 'Grid View' : 'List View'}
                >
                  {v === 'grid' ? <LayoutGrid size={16} /> : <List size={16} />}
                </button>
              ))}
            </div>
            <div className="relative group w-full sm:w-48 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-primary transition-colors" />
              <input
                placeholder={t('Фильтр серверов...', 'Filter instances...')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-1.5 bg-background/50 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200 placeholder-gray-600 h-[34px]"
              />
            </div>
            {canManage && (
              <button onClick={() => setUpdateOpen(true)} className={cn(iconBtn, 'bg-card border border-gray-800 hover:border-primary/50 text-gray-400 hover:text-primary shadow-xl')} title={t('Обновить CS2 через steamcmd', 'Update CS2 (steamcmd)')}>
                <Download className="w-4 h-4" />
              </button>
            )}
            <button onClick={refresh} className={cn(iconBtn, 'bg-card border border-gray-800 hover:border-primary/50 text-gray-400 hover:text-primary shadow-xl')} title={t('Обновить', 'Refresh')}>
              <RefreshCw className={cn('w-4 h-4 transition-transform duration-500 group-active:rotate-180', refreshing && 'animate-spin text-primary')} />
            </button>
            {canManage && (
              <>
                <button onClick={onCreate} className={cn(btn, 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 px-5 py-1.5 text-sm rounded-xl font-bold h-[34px]')}>
                  <Plus size={16} />
                  {t('Создать сервер', 'Create New Server')}
                </button>
                <button onClick={onConnect} className={cn(btn, 'text-gray-400 hover:text-white hover:bg-white/5 border border-gray-800 hover:border-primary/50 px-5 py-1.5 text-sm rounded-xl font-bold h-[34px]')} title={t('Добавить сервер, запущенный не из панели (другой ПК или батник)', 'Add a server started elsewhere (another PC or a .bat file)')}>
                  <Link2 size={16} />
                  {t('Подключить', 'Connect')}
                </button>
              </>
            )}
          </div>
        </header>

        {canManage && inst && !inst.cs2Found && hasManaged && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10">
            <AlertTriangle size={20} className="text-amber-400 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-semibold text-amber-300">{t('Сервер CS2 не найден на этом ПК', 'CS2 server not found on this PC')}</div>
              <div className="text-amber-200/70 break-all">{t('Панель ищет cs2.exe в папке', 'The panel looks for cs2.exe in')} {inst.cs2Dir}</div>
            </div>
            <button onClick={onOpenSettings} className="px-4 py-2 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 shrink-0">
              {t('Указать папку', 'Set folder')}
            </button>
          </div>
        )}

        {servers.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400">{t('Серверов нет. Создайте первый сервер, чтобы начать!', 'No servers found. Create your first server to get started!')}</p>
            {canManage && (
              <button onClick={onCreate} className={cn(btn, 'mx-auto mt-4 bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 px-5 py-1.5 text-sm rounded-xl font-bold h-[34px]')}>
                {t('Создать сервер', 'Create Server')}
              </button>
            )}
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-20 text-gray-400">{t('Ничего не найдено', 'No servers match the filter')}</div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {shown.map((s) => <ServerCard key={s.id} {...itemProps(s)} />)}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {shown.map((s) => <ServerRow key={s.id} {...itemProps(s)} />)}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium bg-card ${toast.ok ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>
            {toast.ok ? <CheckCircle2 size={16} /> : <X size={16} />}
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}

interface ItemProps {
  server: ServerProfile;
  info: ServerStatus | null;
  status: Status;
  statusNote?: string;
  busy?: Action;
  copied: string | null;
  canManage: boolean;
  onAction: (action: Action) => void;
  onCopy: (text: string, id: string) => void;
  onEdit: (server: ServerProfile) => void;
  onDelete: (id: number) => void;
  onOpen: (id: number, section: Section) => void;
}

function StatusPill({ status, note }: { status: Status; note?: string }) {
  const { t } = useT();
  const pill = 'px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center backdrop-blur-md shadow-sm';
  const spinner = (c: string) => <div className={cn('w-2 h-2 border-2 border-t-transparent rounded-full animate-spin mr-1.5', c)}></div>;
  switch (status) {
    case 'ONLINE':
      return <div className={cn(pill, 'bg-green-500/10 text-green-500 border-green-500/20')}><span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>{t('ОНЛАЙН', 'ONLINE')}</div>;
    case 'STARTING':
      return <div className={cn(pill, 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20')} title={note}>{spinner('border-yellow-500')}{t('ЗАПУСК', 'STARTING')}</div>;
    case 'STOPPING':
      return <div className={cn(pill, 'bg-orange-500/10 text-orange-500 border-orange-500/20')}>{spinner('border-orange-500')}{t('ОСТАНОВКА', 'STOPPING')}</div>;
    case 'CRASHED':
      return <div className={cn(pill, 'bg-red-500/10 text-red-500 border-red-500/20')} title={note}><span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 animate-pulse"></span>{t('УПАЛ', 'CRASHED')}</div>;
    case 'CHECKING':
      return <div className={cn(pill, 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>{spinner('border-gray-400')}{t('ПРОВЕРКА', 'CHECKING')}</div>;
    default:
      return <div className={cn(pill, 'bg-gray-500/10 text-gray-400 border-gray-500/20')} title={note}><span className="w-1.5 h-1.5 rounded-full bg-gray-500 mr-1.5"></span>{t('ОФЛАЙН', 'OFFLINE')}</div>;
  }
}

function Spin() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-current/20 border-t-current" />;
}

function ServerCard({ server, info, status, statusNote, busy, copied, canManage, onAction, onCopy, onEdit, onDelete, onOpen }: ItemProps) {
  const { t } = useT();
  const id = server.id!;
  const address = `${server.host}:${server.port}`;
  const down = status === 'OFFLINE' || status === 'CRASHED';
  return (
    <div className={cn('bg-card rounded-xl border border-gray-800/50 overflow-hidden flex flex-col group hover:border-primary/50 transition-all duration-300', status === 'OFFLINE' && 'opacity-70 grayscale-[0.5]')}>
      <div className="relative h-32 overflow-hidden bg-gray-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`Map ${info?.map ?? ''}`} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500" src={mapImage(info?.map)} />
        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent"></div>
        <div className="absolute top-3 left-3 flex items-center"><StatusPill status={status} note={statusNote} /></div>
        <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center gap-2">
          <p className="text-white text-[10px] font-bold tracking-widest uppercase opacity-80 truncate max-w-[150px]">{info?.map ?? '---'}</p>
          {!server.managed && (
            <div className="px-1.5 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/30 text-[8px] font-black text-purple-400 uppercase tracking-tighter backdrop-blur-sm flex items-center gap-1" title={t('Сервер запущен не из панели', 'Started outside the panel')}>
              <Shield className="w-2.5 h-2.5" />
              Remote
            </div>
          )}
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start gap-2 mb-4">
          <h3 className="font-bold text-white truncate text-sm">{server.name}</h3>
          <span className="text-[10px] text-gray-500 font-mono shrink-0">ID: {id}</span>
        </div>
        <div className="space-y-3 mb-6">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400 flex items-center"><Users className="w-3.5 h-3.5 mr-2 opacity-70" /> {t('Игроки', 'Players')}</span>
            <span className="text-white font-medium">{info ? info.players.online : 0} / {info ? info.players.max : server.managed?.maxPlayers ?? 0}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400 flex items-center"><Hash className="w-3.5 h-3.5 mr-2 opacity-70" /> {t('IP-адрес', 'IP Address')}</span>
            <button
              type="button"
              title={t('Скопировать адрес сервера', 'Copy server address')}
              className="flex items-center gap-1.5 text-primary hover:text-blue-400 transition-colors group/ip bg-transparent border-0 p-0 focus:outline-none"
              onClick={() => onCopy(address, String(id))}
            >
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/5 border border-primary/10 group-hover/ip:border-primary/30 transition-all">
                <span className="font-mono text-[10px] font-bold">{address}</span>
                {copied === String(id) ? <Check size={10} className="text-primary" /> : <Copy size={10} className="text-primary opacity-40 group-hover/ip:opacity-100 transition-opacity" />}
              </div>
            </button>
          </div>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-4 border-t border-gray-800/60">
          {server.managed && canManage && (
            down ? (
              <button onClick={() => onAction('start')} disabled={!!busy} className={cn(btn, 'flex-1 bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 px-3 py-1 text-xs rounded-lg h-[34px] font-bold')}>
                {busy === 'start' ? <Spin /> : <Play className="w-3.5 h-3.5" />}
                {busy === 'start' ? t('Запуск...', 'Starting...') : t('Запустить', 'Start')}
              </button>
            ) : (
              <div className="flex flex-1 gap-1.5">
                <button onClick={() => onAction('stop')} disabled={!!busy || status === 'STOPPING'} className={cn(btn, 'flex-1 text-red-500 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 px-3 py-1 text-xs rounded-lg h-[34px] font-bold')}>
                  {busy === 'stop' || status === 'STOPPING' ? <Spin /> : <Square className="w-3 h-3 fill-current" />}
                  {busy === 'stop' || status === 'STOPPING' ? t('Остановка...', 'Stopping...') : t('Стоп', 'Stop')}
                </button>
                <button onClick={() => onAction('restart')} disabled={!!busy || status === 'STOPPING'} className={cn(iconBtn, 'text-amber-500 hover:bg-amber-500/10')} title={t('Перезапустить сервер', 'Restart Server')}>
                  <RotateCcw className={cn('w-4 h-4', busy === 'restart' && 'animate-spin')} />
                </button>
              </div>
            )
          )}
          {!server.managed && <div className="flex-1" />}
          <button onClick={() => onOpen(id, 'console')} className={cn(iconBtn, 'text-blue-500 hover:bg-blue-500/10 border border-blue-500/20')} title={t('Консоль', 'Console')}>
            <Terminal className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onOpen(id, 'settings')} className={cn(iconBtn, 'text-gray-400 hover:text-white hover:bg-white/5')} title={t('Настройки сервера', 'Server settings')}>
            <Settings className="w-3.5 h-3.5" />
          </button>
          {canManage && (
            <>
              <button onClick={() => onEdit(server)} className={cn(iconBtn, 'text-gray-400 hover:text-white hover:bg-white/5')} title={server.managed ? t('Параметры запуска', 'Launch settings') : t('Изменить', 'Edit')}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(id)} className={cn(iconBtn, 'text-red-500 hover:bg-red-500/10 border border-red-500/20')} title={t('Удалить сервер', 'Delete server')}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ServerRow({ server, info, status, statusNote, busy, copied, canManage, onAction, onCopy, onEdit, onDelete, onOpen }: ItemProps) {
  const { t } = useT();
  const id = server.id!;
  const address = `${server.host}:${server.port}`;
  const down = status === 'OFFLINE' || status === 'CRASHED';
  return (
    <div className={cn('flex flex-wrap md:flex-nowrap items-center gap-4 bg-card hover:bg-card/80 p-3 rounded-xl border border-gray-800/50 transition-all', status === 'OFFLINE' && 'opacity-80')}>
      <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center shrink-0 border border-gray-800 overflow-hidden" title={statusNote ?? status}>
        {status === 'ONLINE' ? <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          : status === 'OFFLINE' ? <div className="w-2 h-2 rounded-full bg-gray-500" />
          : status === 'CRASHED' ? <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          : <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-white text-sm truncate">{server.name}</h3>
          <span className="text-[10px] text-gray-600 font-mono">#{id}</span>
          {!server.managed && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[8px] font-black text-purple-500 uppercase tracking-widest">
              <Shield className="w-2 h-2" />
              Remote
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest truncate max-w-[120px]">{info?.map ?? '---'}</p>
          <span className="text-[10px] text-gray-700">|</span>
          <button type="button" onClick={() => onCopy(address, String(id))} className="group/ip flex items-center gap-1.5 transition-colors focus:outline-none" title={t('Скопировать адрес сервера', 'Copy server address')}>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/5 border border-primary/10 group-hover/ip:border-primary/30 transition-all">
              <span className="text-[10px] text-gray-500 font-mono font-bold group-hover/ip:text-primary transition-colors">{address}</span>
              {copied === String(id) ? <Check size={10} className="text-primary transition-all scale-110" /> : <Copy size={10} className="text-primary opacity-40 group-hover/ip:opacity-100 transition-all" />}
            </div>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-8 shrink-0 px-4">
        <div className="flex flex-col items-center min-w-[60px]">
          <span className="text-[9px] text-gray-600 font-black uppercase tracking-tighter mb-1">{t('Игроки', 'Players')}</span>
          <div className="flex items-center gap-1.5">
            <Users size={12} className="text-gray-500" />
            <span className="text-xs font-bold text-gray-200">{info ? info.players.online : 0} / {info ? info.players.max : server.managed?.maxPlayers ?? 0}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {server.managed && canManage && (
          down ? (
            <button onClick={() => onAction('start')} disabled={!!busy} className={cn(iconBtn, 'text-green-500 hover:bg-green-500/10 border border-green-500/20')} title={t('Запустить', 'Start')}>
              {busy === 'start' ? <Spin /> : <Play size={16} />}
            </button>
          ) : (
            <>
              <button onClick={() => onAction('stop')} disabled={!!busy || status === 'STOPPING'} className={cn(iconBtn, 'text-red-500 hover:bg-red-500/10 border border-red-500/20')} title={t('Стоп', 'Stop')}>
                {busy === 'stop' || status === 'STOPPING' ? <Spin /> : <Square size={16} className="fill-current" />}
              </button>
              <button onClick={() => onAction('restart')} disabled={!!busy || status === 'STOPPING'} className={cn(iconBtn, 'text-amber-500 hover:bg-amber-500/10 border border-amber-500/20')} title={t('Перезапустить сервер', 'Restart Server')}>
                <RotateCcw className={cn('w-4 h-4', busy === 'restart' && 'animate-spin')} />
              </button>
            </>
          )
        )}
        <button onClick={() => onOpen(id, 'console')} className={cn(iconBtn, 'text-blue-500 hover:bg-blue-500/10 border border-blue-500/20')} title={t('Консоль', 'Console')}>
          <Terminal size={16} />
        </button>
        <div className="w-px h-6 bg-gray-800 mx-1" />
        <button onClick={() => onOpen(id, 'settings')} className={cn(iconBtn, 'text-gray-400 hover:text-white hover:bg-white/5')} title={t('Настройки сервера', 'Server settings')}>
          <Settings size={16} />
        </button>
        {canManage && (
          <>
            <button onClick={() => onEdit(server)} className={cn(iconBtn, 'text-gray-400 hover:text-white hover:bg-white/5')} title={server.managed ? t('Параметры запуска', 'Launch settings') : t('Изменить', 'Edit')}>
              <Pencil size={16} />
            </button>
            <button onClick={() => onDelete(id)} className={cn(iconBtn, 'text-red-500 hover:bg-red-500/10 border border-red-500/20')} title={t('Удалить сервер', 'Delete server')}>
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
