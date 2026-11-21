"use client";

import React from 'react';
import { Users, Clock, ShieldAlert, RefreshCw, Search, UserMinus, User, LogIn, LogOut, Calendar, CheckCircle2, X, Wifi } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

// Player Management, ported from the Quatrix Players page (Live Players / Join Logs / Ban History tabs).

interface LivePlayer { userid: number; name: string; steamid: string; address: string; connected: string; ping: number; state: string }
interface JoinEvent { t: number; name: string; steamid: string; event: 'join' | 'leave'; address?: string; reason?: string }
interface Ban { id: number; steamid: string; name: string; reason: string; minutes: number; created_at: string; expires_at?: string; by: string; unbanned_at?: string; active: boolean }

type Tab = 'live' | 'logs' | 'bans';
type Notify = (ok: boolean, text: string) => void;

const searchCls = 'w-full pl-10 pr-4 py-1.5 bg-background/50 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200 placeholder-gray-600 h-[34px]';
const iconBtn = 'flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 group p-2 rounded-xl w-[34px] h-[34px] shrink-0';
const th = 'px-6 py-4 border-b border-gray-800/50';

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative group w-full sm:w-64">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-primary transition-colors" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={searchCls} />
    </div>
  );
}

function Refresh({ onClick, spinning }: { onClick: () => void; spinning: boolean }) {
  const { t } = useT();
  return (
    <button onClick={onClick} className={cn(iconBtn, 'bg-card border border-gray-800 hover:border-primary/50 text-gray-400 hover:text-primary shadow-xl')} title={t('Обновить', 'Refresh')}>
      <RefreshCw className={cn('w-4 h-4', spinning && 'animate-spin text-primary')} />
    </button>
  );
}

export function PlayersView({ serverId }: { serverId: number }) {
  const { t } = useT();
  const [tab, setTab] = React.useState<Tab>('live');
  const [toast, setToast] = React.useState<{ ok: boolean; text: string } | null>(null);
  const notify: Notify = (ok, text) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  };

  const tabs = [
    { id: 'live' as const, label: t('Игроки онлайн', 'Live Players'), icon: Users },
    { id: 'logs' as const, label: t('Входы и выходы', 'Join Logs'), icon: Clock },
    { id: 'bans' as const, label: t('История банов', 'Ban History'), icon: ShieldAlert },
  ];

  return (
    <div className="p-3 md:p-6 h-full flex flex-col">
      <div className="bg-card rounded-2xl border border-gray-800 overflow-hidden shadow-2xl flex-1 flex flex-col">
        <div className="px-6 border-b border-gray-800 flex space-x-8 bg-card overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`py-4 text-sm font-semibold transition-all relative whitespace-nowrap flex items-center gap-2 ${tab === item.id ? 'text-primary' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <item.icon size={16} />
              {item.label}
              {tab === item.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-lg shadow-primary/50"></div>}
            </button>
          ))}
        </div>
        <div className="p-4 md:p-8 flex-1 overflow-y-auto">
          {tab === 'live' && <LivePlayersTab serverId={serverId} notify={notify} />}
          {tab === 'logs' && <JoinLogsTab serverId={serverId} />}
          {tab === 'bans' && <BanHistoryTab notify={notify} />}
        </div>
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

function LivePlayersTab({ serverId, notify }: { serverId: number; notify: Notify }) {
  const { t } = useT();
  const [players, setPlayers] = React.useState<LivePlayer[] | null>(null);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [refreshing, setRefreshing] = React.useState(false);
  const [banFor, setBanFor] = React.useState<LivePlayer | null>(null);
  const [reason, setReason] = React.useState('');
  const [minutes, setMinutes] = React.useState('0');

  const load = React.useCallback(async () => {
    try {
      setPlayers(await api<LivePlayer[]>(`/api/servers/${serverId}/players`));
      setError('');
    } catch (e) {
      setPlayers([]);
      setError((e as Error).message);
    }
  }, [serverId]);

  React.useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    notify(true, t('Список игроков обновлён', 'Player list updated'));
  };

  const doKick = async (p: LivePlayer) => {
    if (!confirm(t(`Кикнуть ${p.name}?`, `Kick ${p.name}?`))) return;
    try {
      await api(`/api/servers/${serverId}/players/${p.userid}`, { body: { action: 'kick', name: p.name, reason: 'Kicked by referee' } });
      notify(true, t('Игрок кикнут', 'Player kicked successfully'));
      setTimeout(load, 1500);
    } catch (e) {
      notify(false, (e as Error).message || t('Не удалось кикнуть игрока', 'Failed to kick player'));
    }
  };

  const confirmBan = async () => {
    if (!banFor) return;
    try {
      await api(`/api/servers/${serverId}/players/${banFor.userid}`, { body: { action: 'ban', name: banFor.name, steamid: banFor.steamid, reason, minutes: Number(minutes) } });
      notify(true, t('Игрок забанен', 'Player banned successfully'));
      setBanFor(null);
      setReason('');
      setTimeout(load, 1500);
    } catch (e) {
      notify(false, (e as Error).message || t('Не удалось забанить игрока', 'Failed to ban player'));
    }
  };

  const q = search.toLowerCase();
  const shown = (players ?? []).filter((p) => p.name.toLowerCase().includes(q) || p.steamid.includes(q));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="bg-card px-6 py-3 rounded-xl border border-gray-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary"><Users size={18} /></div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{t('Игроков онлайн', 'Active Players')}</p>
              <p className="text-xl font-bold text-white tracking-tight">{players?.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <SearchBox value={search} onChange={setSearch} placeholder={t('Поиск по нику или SteamID...', 'Search by name or SteamID...')} />
          <Refresh onClick={refresh} spinning={refreshing} />
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      <div className="bg-card rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[680px]">
            <thead>
              <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                <th className={th}>{t('Игрок', 'Player Information')}</th>
                <th className={th}>Steam ID</th>
                <th className={th}>{t('IP-адрес', 'IP Address')}</th>
                <th className={cn(th, 'text-center')}>{t('На сервере', 'Connected')}</th>
                <th className={cn(th, 'text-center')}>{t('Пинг', 'Latency')}</th>
                <th className={cn(th, 'text-right')}>{t('Модерация', 'Moderation')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {players === null ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500 text-sm">{t('Загрузка игроков...', 'Loading players...')}</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500 text-sm">{t('Игроков нет', 'No players found')}</td></tr>
              ) : shown.map((p) => (
                <tr key={p.userid} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-primary font-bold border border-gray-700">{p.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <span className="font-bold text-white text-sm block">{p.name}</span>
                        <span className="text-[10px] text-primary font-mono opacity-60 uppercase">{p.state} · #{p.userid}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-primary font-mono select-all font-semibold">{p.steamid || <span className="text-gray-600" title={t('SteamID появится, когда сервер пришлёт лог со входом игрока', 'The SteamID shows up once the server logs the player joining')}>-</span>}</td>
                  <td className="px-6 py-4 text-xs font-mono text-primary font-bold">{p.address || '-'}</td>
                  <td className="px-6 py-4 text-sm font-mono text-center text-gray-400">{p.connected}</td>
                  <td className="px-6 py-4 text-sm font-mono text-center text-gray-400"><span className="inline-flex items-center gap-1"><Wifi size={12} />{p.ping}</span></td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => doKick(p)} title={t('Кикнуть', 'Kick Player')} className={cn(iconBtn, 'text-yellow-500 hover:bg-yellow-500/10')}><UserMinus size={14} /></button>
                      <button onClick={() => setBanFor(p)} disabled={!p.steamid} title={p.steamid ? t('Забанить', 'Ban Player') : t('Нет SteamID: сервер не прислал лог со входом игрока', 'No SteamID: the server has not logged this player joining')} className={cn(iconBtn, 'text-red-500 hover:bg-red-500/10')}><ShieldAlert size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {banFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-red-500/10 text-red-500"><ShieldAlert size={24} /></div>
              <div>
                <h3 className="text-xl font-bold text-white">{t('Бан игрока', 'Ban Player')}</h3>
                <p className="text-sm text-gray-400">{t('Закрыть игроку доступ на серверы панели', 'Permanently restrict access')}</p>
              </div>
            </div>
            <div className="mb-4 p-4 bg-white/5 rounded-xl border border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-red-500 font-bold border border-gray-700">{banFor.name.charAt(0).toUpperCase()}</div>
                <div>
                  <p className="font-bold text-white">{banFor.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{banFor.steamid}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">{t('Причина бана', 'Ban Reason')}</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('например, читы, токсичное поведение...', 'e.g., Cheating, Toxic behavior...')}
                  className="w-full px-4 py-2 bg-background border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">{t('Срок бана', 'Ban Duration')}</label>
                <select value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-full px-4 py-2 bg-background border border-gray-800 rounded-xl text-white focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none">
                  <option value="0">{t('Навсегда', 'Permanent')}</option>
                  <option value="60">{t('1 час', '1 Hour')}</option>
                  <option value="360">{t('6 часов', '6 Hours')}</option>
                  <option value="720">{t('12 часов', '12 Hours')}</option>
                  <option value="1440">{t('1 день', '1 Day')}</option>
                  <option value="10080">{t('1 неделя', '1 Week')}</option>
                  <option value="43200">{t('1 месяц', '1 Month')}</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setBanFor(null)} className="flex-1 px-5 py-1.5 h-[34px] text-sm rounded-xl font-bold bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50 transition-all active:scale-95">{t('Отмена', 'Cancel')}</button>
              <button onClick={confirmBan} className="flex-1 px-5 py-1.5 h-[34px] text-sm rounded-xl font-bold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 transition-all active:scale-95">{t('Забанить', 'Confirm Ban')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function JoinLogsTab({ serverId }: { serverId: number }) {
  const { t, locale } = useT();
  const [logs, setLogs] = React.useState<JoinEvent[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLogs(await api<JoinEvent[]>(`/api/servers/${serverId}/joins`).catch(() => []));
  }, [serverId]);
  React.useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const q = search.toLowerCase();
  const shown = (logs ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.steamid.includes(q));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><Clock className="w-5 h-5 text-primary" />{t('Входы и выходы', 'Join/Leave History')}</h3>
          <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-bold tracking-widest uppercase">{t('В реальном времени', 'Live Feed')}</span>
        </div>
        <div className="flex items-center gap-4">
          <SearchBox value={search} onChange={setSearch} placeholder={t('Поиск по истории...', 'Search history...')} />
          <Refresh onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }} spinning={refreshing} />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                <th className={th}>{t('Время', 'Timestamp')}</th>
                <th className={th}>{t('Игрок', 'Player')}</th>
                <th className={th}>Steam ID</th>
                <th className={cn(th, 'text-right')}>{t('Событие', 'Event')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {logs === null ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500 text-sm">{t('Загрузка журнала...', 'Loading logs...')}</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500 text-sm">{t('Записей нет. Они появятся, когда сервер начнёт присылать лог в панель.', 'No logs found for this server.')}</td></tr>
              ) : shown.map((l, i) => (
                <tr key={`${l.t}-${i}`} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4 text-xs text-gray-500 font-mono">{new Date(l.t).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 text-xs font-bold border border-gray-700"><User size={14} /></div>
                      <span className="font-bold text-white text-sm">{l.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-primary font-mono select-all">{l.steamid}</td>
                  <td className="px-6 py-4 text-right">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${l.event === 'join' ? 'bg-green-500/10 text-green-500 border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]'}`}
                      title={l.reason}
                    >
                      {l.event === 'join' ? <LogIn size={10} /> : <LogOut size={10} />}
                      {l.event === 'join' ? t('вход', 'join') : t('выход', 'leave')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BanHistoryTab({ notify }: { notify: Notify }) {
  const { t, locale } = useT();
  const [bans, setBans] = React.useState<Ban[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [activeOnly, setActiveOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setBans(await api<Ban[]>('/api/bans').catch(() => []));
    setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const doUnban = async (b: Ban) => {
    if (!confirm(t(`Разбанить ${b.name}?`, `Unban ${b.name}?`))) return;
    try {
      await api(`/api/bans/${b.id}`, { method: 'DELETE' });
      notify(true, t('Игрок разбанен', 'Player unbanned successfully'));
      load();
    } catch (e) {
      notify(false, (e as Error).message || t('Не удалось разбанить', 'Failed to unban player'));
    }
  };

  const q = search.toLowerCase();
  const shown = (bans ?? []).filter((b) => (!activeOnly || b.active) && (b.name.toLowerCase().includes(q) || b.steamid.includes(q) || b.reason.toLowerCase().includes(q)));
  const duration = (m: number) => (m === 0 ? t('Навсегда', 'Permanent') : m % 1440 === 0 ? `${m / 1440}d` : m % 60 === 0 ? `${m / 60}h` : `${m}m`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-red-500" />{t('Нарушения', 'Incident Records')}</h3>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="sr-only peer" />
              <div className="w-10 h-5 bg-gray-800 rounded-full peer peer-checked:bg-primary transition-all duration-300"></div>
              <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-all duration-300"></div>
            </div>
            <span className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors uppercase tracking-widest">{t('Только активные', 'Active Bans Only')}</span>
          </label>
        </div>
        <div className="flex items-center gap-4">
          <SearchBox value={search} onChange={setSearch} placeholder={t('Поиск по банам...', 'Search bans...')} />
          <Refresh onClick={load} spinning={loading} />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[680px]">
            <thead>
              <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                <th className={th}>{t('Игрок', 'Player')}</th>
                <th className={th}>{t('Причина', 'Reason')}</th>
                <th className={th}>{t('Дата бана', 'Ban Date')}</th>
                <th className={th}>{t('Статус', 'Status')}</th>
                <th className={cn(th, 'text-right')}>{t('Действия', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {bans === null ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">{t('Загрузка...', 'Loading records...')}</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">{t('Банов нет.', 'No ban records found.')}</td></tr>
              ) : shown.map((b) => (
                <tr key={b.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-red-500 font-bold border border-gray-700">{b.name?.[0]?.toUpperCase() || '?'}</div>
                      <div>
                        <span className="font-bold text-white text-sm block">{b.name}</span>
                        <span className="text-[10px] text-gray-500 font-mono tracking-tighter">{b.steamid}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-gray-300 font-medium">{b.reason || '---'}</span>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold uppercase"><User size={10} />{t('выдал', 'By')} {b.by}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-xs text-gray-300 font-mono"><Calendar size={12} className="text-gray-600" />{new Date(b.created_at).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold uppercase"><Clock size={10} />{duration(b.minutes)}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {b.active ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]"><ShieldAlert size={10} />{t('Активен', 'Active')}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-500 border border-green-500/20">{b.unbanned_at ? t('Снят', 'Resolved') : t('Истёк', 'Expired')}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {b.active && (
                      <button onClick={() => doUnban(b)} className="px-3 py-1 text-xs rounded-lg font-bold text-green-500 hover:bg-green-500/10 border border-green-500/20 transition-all active:scale-95">{t('Разбанить', 'Unban')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
