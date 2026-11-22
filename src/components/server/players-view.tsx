"use client";

import React from 'react';
import { Users, Clock, ShieldAlert, RefreshCw, Search, UserMinus, LogIn, LogOut, Calendar, CheckCircle2, X, Wifi, Activity, Gavel, User } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { CustomSelect } from '@/components/ui/custom-select';
import { teamsApi } from '@/lib/teams';

// Player Management from the Quatrix Players page (Live Players / Join Logs / Ban History),
// laid out like the Match, Console and Chat pages: stat tiles on top, one card with the tabs.

interface LivePlayer { userid: number; name: string; steamid: string; address: string; connected: string; ping: number; state: string }
interface JoinEvent { t: number; name: string; steamid: string; event: 'join' | 'leave'; address?: string; reason?: string }
interface Ban { id: number; steamid: string; name: string; reason: string; minutes: number; created_at: string; expires_at?: string; by: string; unbanned_at?: string; active: boolean }

type Tab = 'live' | 'logs' | 'bans';

const card = 'bg-card rounded-2xl border border-gray-800 shadow-2xl';
const th = 'px-4 sm:px-6 py-4 border-b border-gray-800/50';
const td = 'px-4 sm:px-6 py-3.5';
const iconBtn = 'flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl w-[34px] h-[34px] shrink-0';
const pill = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border';

const initial = (name?: string) => name?.trim().charAt(0).toUpperCase() || '?';
const pingClass = (ping: number) => (ping < 50 ? 'text-green-500' : ping < 100 ? 'text-amber-400' : 'text-red-500');

export function PlayersView({ serverId }: { serverId: number }) {
  const { t, locale } = useT();
  const [tab, setTab] = React.useState<Tab>('live');
  const [search, setSearch] = React.useState('');
  const [activeOnly, setActiveOnly] = React.useState(false);
  const [players, setPlayers] = React.useState<LivePlayer[] | null>(null);
  const [playersError, setPlayersError] = React.useState('');
  const [joins, setJoins] = React.useState<JoinEvent[] | null>(null);
  const [bans, setBans] = React.useState<Ban[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [banFor, setBanFor] = React.useState<LivePlayer | null>(null);
  const [toast, setToast] = React.useState<{ ok: boolean; text: string } | null>(null);
  // Team of each SteamID from the team library, shown next to the player's name
  const [rosterTeam, setRosterTeam] = React.useState<Map<string, string>>(new Map());

  React.useEffect(() => {
    teamsApi.list()
      .then((list) => setRosterTeam(new Map(list.flatMap((tm) => tm.players.map((p) => [p.steamid, tm.tag || tm.name] as [string, string])))))
      .catch(() => {});
  }, []);

  const notify = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  };

  const loadPlayers = React.useCallback(async () => {
    try {
      setPlayers(await api<LivePlayer[]>(`/api/servers/${serverId}/players`));
      setPlayersError('');
    } catch (e) {
      setPlayers([]);
      setPlayersError((e as Error).message);
    }
  }, [serverId]);
  const loadJoins = React.useCallback(async () => {
    setJoins(await api<JoinEvent[]>(`/api/servers/${serverId}/joins`).catch(() => []));
  }, [serverId]);
  const loadBans = React.useCallback(async () => {
    setBans(await api<Ban[]>('/api/bans').catch(() => []));
  }, []);
  const loadAll = React.useCallback(() => Promise.all([loadPlayers(), loadJoins(), loadBans()]), [loadPlayers, loadJoins, loadBans]);

  React.useEffect(() => {
    loadAll();
    const timer = setInterval(() => { loadPlayers(); loadJoins(); }, 10_000);
    return () => clearInterval(timer);
  }, [loadAll, loadPlayers, loadJoins]);

  const refresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const doKick = async (p: LivePlayer) => {
    if (!confirm(t(`Кикнуть ${p.name}?`, `Kick ${p.name}?`))) return;
    try {
      await api(`/api/servers/${serverId}/players/${p.userid}`, { body: { action: 'kick', name: p.name, reason: 'Kicked by referee' } });
      notify(true, t('Игрок кикнут', 'Player kicked successfully'));
      setTimeout(loadPlayers, 1500);
    } catch (e) {
      notify(false, (e as Error).message || t('Не удалось кикнуть игрока', 'Failed to kick player'));
    }
  };

  const doUnban = async (b: Ban) => {
    if (!confirm(t(`Разбанить ${b.name}?`, `Unban ${b.name}?`))) return;
    try {
      await api(`/api/bans/${b.id}`, { method: 'DELETE' });
      notify(true, t('Игрок разбанен', 'Player unbanned successfully'));
      loadBans();
    } catch (e) {
      notify(false, (e as Error).message || t('Не удалось разбанить', 'Failed to unban player'));
    }
  };

  const q = search.trim().toLowerCase();
  const livePlayers = players ?? [];
  const shownPlayers = livePlayers.filter((p) => p.name.toLowerCase().includes(q) || p.steamid.includes(q));
  const shownJoins = (joins ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.steamid.includes(q));
  const shownBans = (bans ?? []).filter((b) => (!activeOnly || b.active) && (b.name.toLowerCase().includes(q) || b.steamid.includes(q) || b.reason.toLowerCase().includes(q)));

  const avgPing = livePlayers.length ? Math.round(livePlayers.reduce((n, p) => n + p.ping, 0) / livePlayers.length) : null;
  const today = new Date().toDateString();
  const joinsToday = (joins ?? []).filter((l) => l.event === 'join' && new Date(l.t).toDateString() === today).length;
  const activeBans = (bans ?? []).filter((b) => b.active).length;
  const duration = (m: number) => (m === 0 ? t('навсегда', 'permanent') : m % 1440 === 0 ? t(`${m / 1440} д`, `${m / 1440}d`) : m % 60 === 0 ? t(`${m / 60} ч`, `${m / 60}h`) : t(`${m} мин`, `${m}m`));

  const tabs = [
    { id: 'live' as const, label: t('Онлайн', 'Live Players'), short: t('Онлайн', 'Live'), icon: Users, count: livePlayers.length },
    { id: 'logs' as const, label: t('Входы и выходы', 'Join Logs'), short: t('Входы', 'Joins'), icon: Clock, count: joins?.length ?? 0 },
    { id: 'bans' as const, label: t('Баны', 'Ban History'), short: t('Баны', 'Bans'), icon: ShieldAlert, count: activeBans },
  ];

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Stat tiles, as on the Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title={t('Игроков онлайн', 'Active Players')} value={String(livePlayers.length)} icon={<Users size={18} />} color="text-primary" description={t('без ботов и GOTV', 'no bots or GOTV')} />
        <StatCard title={t('Средний пинг', 'Average ping')} value={avgPing === null ? '-' : t(`${avgPing} мс`, `${avgPing} ms`)} icon={<Wifi size={18} />} color="text-green-500" description={t('по игрокам онлайн', 'of the players online')} />
        <StatCard title={t('Входов сегодня', 'Joins today')} value={String(joinsToday)} icon={<Activity size={18} />} color="text-purple-500" description={t('по логу сервера', 'from the server log')} />
        <StatCard title={t('Активных банов', 'Active bans')} value={String(activeBans)} icon={<Gavel size={18} />} color="text-red-500" description={t('на всех серверах панели', 'on all panel servers')} />
      </div>

      <section className={cn(card, 'overflow-hidden')}>
        {/* Header: tabs as the Servers view switch, search and refresh */}
        <div className="p-4 sm:px-6 border-b border-gray-800/60 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="grid grid-cols-3 sm:flex bg-background/50 border border-gray-800 rounded-xl p-[3px] shadow-sm shadow-black/20">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 h-[34px] rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all',
                  tab === item.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white hover:bg-white/5',
                )}
              >
                <item.icon size={15} className="hidden sm:block" />
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
                <span className={cn('min-w-5 px-1.5 rounded-md text-[10px] font-black tabular-nums', tab === item.id ? 'bg-white/20' : 'bg-white/5 text-gray-500')}>{item.count}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            {tab === 'bans' && (
              <label className="flex items-center gap-2 mr-1 cursor-pointer group shrink-0">
                <div className="relative">
                  <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="sr-only peer" />
                  <div className="w-10 h-5 bg-gray-800 rounded-full peer-checked:bg-primary transition-all duration-300" />
                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-all duration-300" />
                </div>
                <span className="text-[10px] font-bold text-gray-400 group-hover:text-white transition-colors uppercase tracking-widest">{t('Активные', 'Active only')}</span>
              </label>
            )}
            <div className="relative group flex-1 lg:w-64 lg:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-primary transition-colors" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === 'bans' ? t('Ник, SteamID или причина...', 'Name, SteamID or reason...') : t('Поиск по нику или SteamID...', 'Search by name or SteamID...')}
                className="w-full pl-10 pr-4 py-1.5 bg-background/50 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200 placeholder-gray-600 h-[34px]"
              />
            </div>
            <button onClick={refresh} className={cn(iconBtn, 'bg-background/50 border border-gray-800 hover:border-primary/50 text-gray-400 hover:text-primary')} title={t('Обновить', 'Refresh')} aria-label={t('Обновить', 'Refresh')}>
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin text-primary')} />
            </button>
          </div>
        </div>

        {tab === 'live' && playersError && <div className="m-4 sm:mx-6 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{playersError}</div>}

        <div className="overflow-x-auto">
          {tab === 'live' && (
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                  <th className={th}>{t('Игрок', 'Player')}</th>
                  <th className={th}>Steam ID</th>
                  <th className={th}>{t('IP-адрес', 'IP Address')}</th>
                  <th className={cn(th, 'text-center')}>{t('На сервере', 'Connected')}</th>
                  <th className={cn(th, 'text-center')}>{t('Пинг', 'Ping')}</th>
                  <th className={cn(th, 'text-right')}>{t('Модерация', 'Moderation')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/30">
                {players === null ? (
                  <EmptyRow cols={6} text={t('Загрузка игроков...', 'Loading players...')} />
                ) : shownPlayers.length === 0 ? (
                  <EmptyRow cols={6} icon={<Users size={22} />} text={q ? t('Никого не нашлось', 'Nobody found') : t('На сервере нет игроков', 'No players on the server')} />
                ) : shownPlayers.map((p) => (
                  <tr key={p.userid} className="hover:bg-white/[0.02] transition-colors group">
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black shrink-0">{initial(p.name)}</div>
                        <div className="min-w-0">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-white text-sm truncate max-w-[14rem]">{p.name}</span>
                            {rosterTeam.get(p.steamid) && (
                              <span className="shrink-0 max-w-[8rem] truncate px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider" title={t('Команда из библиотеки', 'Team from the library')}>
                                {rosterTeam.get(p.steamid)}
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono uppercase">{p.state} · #{p.userid}</span>
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, 'text-xs text-primary font-mono select-all font-semibold')}>
                      {p.steamid || <span className="text-gray-600" title={t('SteamID появится, когда сервер пришлёт лог со входом игрока', 'The SteamID shows up once the server logs the player joining')}>-</span>}
                    </td>
                    <td className={cn(td, 'text-xs font-mono text-gray-300')}>{p.address || '-'}</td>
                    <td className={cn(td, 'text-sm font-mono text-center text-gray-400')}>{p.connected}</td>
                    <td className={cn(td, 'text-sm font-mono text-center font-bold', pingClass(p.ping))}>{p.ping}</td>
                    <td className={cn(td, 'text-right')}>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => doKick(p)} title={t('Кикнуть', 'Kick Player')} className={cn(iconBtn, 'border border-amber-500/20 text-amber-400 hover:bg-amber-500/10')}><UserMinus size={15} /></button>
                        <button
                          onClick={() => setBanFor(p)}
                          disabled={!p.steamid}
                          title={p.steamid ? t('Забанить', 'Ban Player') : t('Нет SteamID: сервер не прислал лог со входом игрока', 'No SteamID: the server has not logged this player joining')}
                          className={cn(iconBtn, 'border border-red-500/20 text-red-500 hover:bg-red-500/10')}
                        >
                          <ShieldAlert size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'logs' && (
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                  <th className={th}>{t('Время', 'Timestamp')}</th>
                  <th className={th}>{t('Игрок', 'Player')}</th>
                  <th className={th}>Steam ID</th>
                  <th className={cn(th, 'text-right')}>{t('Событие', 'Event')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/30">
                {joins === null ? (
                  <EmptyRow cols={4} text={t('Загрузка журнала...', 'Loading logs...')} />
                ) : shownJoins.length === 0 ? (
                  <EmptyRow cols={4} icon={<Clock size={22} />} text={q ? t('Ничего не нашлось', 'Nothing found') : t('Записей нет. Они появятся, когда сервер начнёт присылать лог в панель.', 'No logs found for this server.')} />
                ) : shownJoins.map((l, i) => (
                  <tr key={`${l.t}-${i}`} className="hover:bg-white/[0.02] transition-colors">
                    <td className={cn(td, 'text-xs text-gray-500 font-mono whitespace-nowrap')}>{new Date(l.t).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-black shrink-0', l.event === 'join' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-gray-800 border-gray-700 text-gray-400')}>{initial(l.name)}</div>
                        <span className="font-bold text-white text-sm truncate max-w-[14rem]">{l.name}</span>
                      </div>
                    </td>
                    <td className={cn(td, 'text-xs text-primary font-mono select-all')}>{l.steamid}</td>
                    <td className={cn(td, 'text-right')}>
                      <span
                        className={cn(pill, l.event === 'join' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20')}
                        title={l.reason}
                      >
                        {l.event === 'join' ? <LogIn size={10} /> : <LogOut size={10} />}
                        {l.event === 'join' ? t('вход', 'join') : t('выход', 'leave')}
                      </span>
                      {l.event === 'leave' && l.reason && <div className="mt-1 text-[10px] text-gray-500 truncate max-w-[16rem] ml-auto">{l.reason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'bans' && (
            <table className="w-full text-left border-collapse min-w-[720px]">
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
                  <EmptyRow cols={5} text={t('Загрузка...', 'Loading records...')} />
                ) : shownBans.length === 0 ? (
                  <EmptyRow cols={5} icon={<ShieldAlert size={22} />} text={q || activeOnly ? t('Ничего не нашлось', 'Nothing found') : t('Банов нет', 'No ban records found')} />
                ) : shownBans.map((b) => (
                  <tr key={b.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center font-black shrink-0', b.active ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-gray-800 border-gray-700 text-gray-400')}>{initial(b.name)}</div>
                        <div className="min-w-0">
                          <span className="font-bold text-white text-sm block truncate max-w-[14rem]">{b.name}</span>
                          <span className="text-[10px] text-gray-500 font-mono">{b.steamid}</span>
                        </div>
                      </div>
                    </td>
                    <td className={td}>
                      <span className="text-sm text-gray-300 font-medium block">{b.reason || '---'}</span>
                      <span className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-500 font-bold uppercase"><User size={10} />{t('выдал', 'By')} {b.by}</span>
                    </td>
                    <td className={td}>
                      <span className="flex items-center gap-1.5 text-xs text-gray-300 font-mono whitespace-nowrap"><Calendar size={12} className="text-gray-600" />{new Date(b.created_at).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-500 font-bold uppercase"><Clock size={10} />{duration(b.minutes)}</span>
                    </td>
                    <td className={td}>
                      {b.active
                        ? <span className={cn(pill, 'bg-red-500/10 text-red-500 border-red-500/20')}><ShieldAlert size={10} />{t('Активен', 'Active')}</span>
                        : <span className={cn(pill, 'bg-green-500/10 text-green-500 border-green-500/20')}>{b.unbanned_at ? t('Снят', 'Resolved') : t('Истёк', 'Expired')}</span>}
                    </td>
                    <td className={cn(td, 'text-right')}>
                      {b.active && (
                        <button onClick={() => doUnban(b)} className="h-[34px] px-4 text-xs rounded-xl font-bold text-green-500 hover:bg-green-500/10 border border-green-500/20 transition-all active:scale-95">{t('Разбанить', 'Unban')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {banFor && (
        <BanDialog
          player={banFor}
          onClose={() => setBanFor(null)}
          onBan={async (reason, minutes) => {
            try {
              await api(`/api/servers/${serverId}/players/${banFor.userid}`, { body: { action: 'ban', name: banFor.name, steamid: banFor.steamid, reason, minutes } });
              notify(true, t('Игрок забанен', 'Player banned successfully'));
              setBanFor(null);
              setTimeout(() => { loadPlayers(); loadBans(); }, 1500);
            } catch (e) {
              notify(false, (e as Error).message || t('Не удалось забанить игрока', 'Failed to ban player'));
            }
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium bg-card', toast.ok ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400')}>
            {toast.ok ? <CheckCircle2 size={16} /> : <X size={16} />}
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyRow({ cols, text, icon }: { cols: number; text: string; icon?: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-6 py-14 text-center">
        {icon && <div className="mx-auto mb-3 w-fit p-3 rounded-2xl bg-primary/10 text-primary">{icon}</div>}
        <p className="text-sm text-gray-500">{text}</p>
      </td>
    </tr>
  );
}

// Stat tile as on the Overview
function StatCard({ title, value, icon, description, color }: { title: string; value: string; icon: React.ReactNode; description: string; color: string }) {
  return (
    <div className="p-4 sm:p-6 bg-card rounded-2xl border border-gray-800/60 hover:border-white/10 transition-all hover:translate-y-[-2px] group shadow-lg shadow-black/20 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest truncate">{title}</span>
        <div className={cn('p-2 rounded-lg bg-white/5 group-hover:scale-110 transition-transform shrink-0', color)}>{icon}</div>
      </div>
      <div className="text-xl sm:text-3xl font-black text-white truncate tabular-nums">{value}</div>
      <p className="text-xs text-gray-500 mt-2 font-medium opacity-80 truncate">{description}</p>
    </div>
  );
}

const DURATIONS = [0, 60, 360, 720, 1440, 10080, 43200];

function BanDialog({ player, onClose, onBan }: { player: LivePlayer; onClose: () => void; onBan: (reason: string, minutes: number) => Promise<void> }) {
  const { t } = useT();
  const [reason, setReason] = React.useState('');
  const [minutes, setMinutes] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const label = (m: number) => ({
    0: t('Навсегда', 'Permanent'), 60: t('1 час', '1 Hour'), 360: t('6 часов', '6 Hours'), 720: t('12 часов', '12 Hours'),
    1440: t('1 день', '1 Day'), 10080: t('1 неделя', '1 Week'), 43200: t('1 месяц', '1 Month'),
  } as Record<number, string>)[m];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={cn(card, 'p-6 max-w-md w-full')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 rounded-xl bg-red-500/10 text-red-500"><ShieldAlert size={22} /></div>
          <div>
            <h3 className="text-lg font-bold text-white">{t('Бан игрока', 'Ban Player')}</h3>
            <p className="text-sm text-gray-400">{t('Закрыть доступ на все серверы панели', 'Block access to all panel servers')}</p>
          </div>
        </div>
        <div className="mb-5 p-4 bg-background/50 rounded-xl border border-gray-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 font-black">{initial(player.name)}</div>
          <div className="min-w-0">
            <p className="font-bold text-white truncate">{player.name}</p>
            <p className="text-xs text-gray-500 font-mono">{player.steamid}</p>
          </div>
        </div>
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2">{t('Причина бана', 'Ban Reason')}</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('например, читы, токсичное поведение...', 'e.g., Cheating, Toxic behavior...')}
              className="w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2">{t('Срок бана', 'Ban Duration')}</label>
            <CustomSelect options={DURATIONS.map((m) => ({ value: m, label: label(m) }))} value={minutes} onChange={setMinutes} icon={<Clock className="w-4 h-4" />} />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-[38px] text-sm rounded-xl font-bold bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50 transition-all active:scale-95">{t('Отмена', 'Cancel')}</button>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onBan(reason, minutes); } finally { setBusy(false); } }}
            className="flex-1 h-[38px] text-sm rounded-xl font-bold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {t('Забанить', 'Confirm Ban')}
          </button>
        </div>
      </div>
    </div>
  );
}
