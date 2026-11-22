"use client";

import React from 'react';
import { Shield, Plus, Search, Pencil, Trash2, Users, X, UserPlus, AlertCircle, Hash, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { copyText } from '@/lib/clipboard';
import { MAX_PLAYERS, Team, TeamInput, teamsApi, toSteamId64 } from '@/lib/teams';

// Team library, in the style of the Match setup page: a toolbar, team cards and an editor dialog
export function TeamsView() {
  const { t } = useT();
  const [teams, setTeams] = React.useState<Team[] | null>(null);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  // Editor: a team to edit, 'new' or closed
  const [editing, setEditing] = React.useState<Team | 'new' | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    teamsApi.list().then((list) => { setTeams(list); setError(''); }).catch((e) => setError(e.message));
  }, []);
  React.useEffect(load, [load]);

  const remove = async (team: Team) => {
    if (!confirm(t(`Удалить команду «${team.name}»?`, `Delete team "${team.name}"?`))) return;
    try {
      await teamsApi.remove(team.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copy = async (id: string) => {
    try {
      await copyText(id);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // the id stays visible to copy by hand
    }
  };

  const q = search.trim().toLowerCase();
  const shown = (teams ?? []).filter((tm) => !q
    || tm.name.toLowerCase().includes(q)
    || tm.tag.toLowerCase().includes(q)
    || tm.players.some((p) => p.name.toLowerCase().includes(q) || p.steamid.includes(q)));

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative group flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-primary transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Поиск по команде, игроку, SteamID...', 'Search team, player, SteamID...')}
            className="w-full pl-10 pr-4 bg-card border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200 placeholder-gray-600 h-[38px]"
          />
        </div>
        <div className="sm:ml-auto flex items-center gap-3">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            {t(`команд: ${teams?.length ?? 0}`, `teams: ${teams?.length ?? 0}`)}
          </span>
          <button type="button" onClick={() => setEditing('new')} className={cn(BTN, 'flex-1 sm:flex-none bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20')}>
            <Plus size={16} /> {t('Добавить команду', 'Add team')}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl text-sm font-medium flex items-start gap-2 border bg-red-500/10 text-red-500 border-red-500/20">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {teams === null ? (
        <div className="py-16 flex justify-center"><span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" /></div>
      ) : shown.length === 0 ? (
        <div className={cn(CARD, 'py-14 px-6 flex flex-col items-center justify-center text-center gap-3')}>
          <div className="p-4 rounded-2xl bg-primary/10 text-primary"><Shield size={28} /></div>
          <div className="text-white font-semibold">{q ? t('Ничего не нашлось', 'Nothing found') : t('Команд пока нет', 'No teams yet')}</div>
          {!q && (
            <p className="text-sm text-gray-500 max-w-md">
              {t('Сохраните команды с составами: в «Запуске матча» их можно выбрать из списка, а SteamID игроков MatchZy использует, чтобы развести их по командам.',
                'Save teams with their rosters: pick them from a list in Match setup, and MatchZy uses the players\' SteamIDs to put them on their teams.')}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:gap-6 md:grid-cols-2 xl:grid-cols-3 items-start">
          {shown.map((team) => (
            <section key={team.id} className={cn(CARD, 'overflow-hidden flex flex-col')}>
              <div className="p-4 sm:p-5 flex items-center gap-3 border-b border-gray-800/60">
                <div className="w-11 h-11 rounded-xl border bg-primary/10 text-primary border-primary/30 flex items-center justify-center text-sm font-black shrink-0">{teamInitials(team)}</div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-black text-white truncate">{team.name}</h3>
                  <div className="mt-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-500">
                    {team.tag && <span className="px-1.5 py-0.5 rounded-full border border-gray-700 text-gray-300">{team.tag}</span>}
                    {team.flag && <span className="px-1.5 py-0.5 rounded-full border border-gray-700 text-gray-300">{team.flag}</span>}
                    <span>{t(`игроков: ${team.players.length}`, `players: ${team.players.length}`)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => setEditing(team)} title={t('Изменить', 'Edit')} aria-label={t('Изменить', 'Edit')} className={ICON_BTN}><Pencil size={14} /></button>
                  <button type="button" onClick={() => remove(team)} title={t('Удалить', 'Delete')} aria-label={t('Удалить', 'Delete')} className={cn(ICON_BTN, 'hover:text-red-500 hover:border-red-500/40')}><Trash2 size={14} /></button>
                </div>
              </div>
              {team.players.length === 0 ? (
                <p className="px-4 sm:px-5 py-4 text-xs text-gray-500">{t('Состав не задан: в матче игроки займут места сами.', 'No roster: players take the slots themselves in the match.')}</p>
              ) : (
                <ul className="divide-y divide-gray-800/40">
                  {team.players.map((p) => (
                    <li key={p.steamid} className="px-4 sm:px-5 py-2.5 flex items-center gap-3 min-w-0">
                      <Users size={13} className="text-gray-600 shrink-0" />
                      <span className="text-sm text-gray-200 font-semibold truncate flex-1">{p.name || <span className="text-gray-600">{t('без ника', 'no name')}</span>}</span>
                      <button
                        type="button"
                        onClick={() => copy(p.steamid)}
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-gray-500 hover:text-primary transition-colors shrink-0"
                        title={t('Скопировать SteamID64', 'Copy SteamID64')}
                      >
                        {copied === p.steamid ? <Check size={11} className="text-emerald-400" /> : <Hash size={11} />}
                        {p.steamid}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {editing && (
        <TeamDialog
          team={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

interface PlayerRow { steamid: string; name: string }

function TeamDialog({ team, onClose, onSaved }: { team: Team | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [name, setName] = React.useState(team?.name ?? '');
  const [tag, setTag] = React.useState(team?.tag ?? '');
  const [flag, setFlag] = React.useState(team?.flag ?? '');
  const [players, setPlayers] = React.useState<PlayerRow[]>(team?.players.length ? team.players : [{ steamid: '', name: '' }]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const setPlayer = (i: number, key: keyof PlayerRow, value: string) =>
    setPlayers((list) => list.map((p, j) => (j === i ? { ...p, [key]: value } : p)));
  // A pasted STEAM_0:1:... or [U:1:...] becomes SteamID64 when the field is left
  const normalize = (i: number) =>
    setPlayers((list) => list.map((p, j) => (j === i ? { ...p, steamid: toSteamId64(p.steamid) ?? p.steamid.trim() } : p)));

  const save = async () => {
    // Empty rows are dropped; a row with a name but no SteamID is an error from the server
    const body: TeamInput = { name, tag, flag, players: players.filter((p) => p.steamid.trim() || p.name.trim()) };
    setBusy(true);
    setError('');
    try {
      if (team) await teamsApi.update(team.id, body);
      else await teamsApi.add(body);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={cn(CARD, 'w-full max-w-xl max-h-[90dvh] flex flex-col')} onClick={(e) => e.stopPropagation()}>
        <div className="p-5 sm:p-6 flex items-center gap-3 border-b border-gray-800/60">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0"><Shield size={18} /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-black text-white uppercase tracking-wider">{team ? t('Изменить команду', 'Edit team') : t('Новая команда', 'New team')}</h3>
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{t('название, тег и состав по SteamID', 'name, tag and SteamID roster')}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white" aria-label={t('Закрыть', 'Close')}><X size={18} /></button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-[1fr_5.5rem_4.5rem] gap-3">
            <div>
              <label className={LABEL}>{t('Название', 'Name')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={INPUT} autoFocus />
            </div>
            <div>
              <label className={LABEL}>{t('Тег', 'Tag')}</label>
              <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={12} className={INPUT} />
            </div>
            <div>
              <label className={LABEL} title={t('Код страны: RU, KZ, UA...', 'Country code: RU, KZ, UA...')}>{t('Флаг', 'Flag')}</label>
              <input value={flag} onChange={(e) => setFlag(e.target.value.toUpperCase())} maxLength={2} placeholder="RU" className={cn(INPUT, 'uppercase')} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={cn(LABEL, 'mb-0')}>{t('Состав', 'Roster')} · {players.filter((p) => p.steamid.trim()).length}/{MAX_PLAYERS}</label>
              <span className="text-[10px] text-gray-600">{t('SteamID64, STEAM_0:1:… или [U:1:…]', 'SteamID64, STEAM_0:1:… or [U:1:…]')}</span>
            </div>
            <div className="space-y-2">
              {players.map((p, i) => {
                const bad = p.steamid.trim() !== '' && !toSteamId64(p.steamid);
                return (
                  <div key={i} className="grid grid-cols-[1fr_1.3fr_auto] gap-2">
                    <input value={p.name} onChange={(e) => setPlayer(i, 'name', e.target.value)} placeholder={t('Ник', 'Nickname')} maxLength={32} className={INPUT_SM} />
                    <input
                      value={p.steamid}
                      onChange={(e) => setPlayer(i, 'steamid', e.target.value)}
                      onBlur={() => normalize(i)}
                      placeholder="7656119..."
                      className={cn(INPUT_SM, 'font-mono', bad && 'border-red-500/60 focus:ring-red-500')}
                    />
                    <button
                      type="button"
                      onClick={() => setPlayers((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : [{ steamid: '', name: '' }]))}
                      className={cn(ICON_BTN, 'h-[38px] w-[38px] hover:text-red-500 hover:border-red-500/40')}
                      aria-label={t('Убрать игрока', 'Remove player')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            {players.length < MAX_PLAYERS && (
              <button
                type="button"
                onClick={() => setPlayers((list) => [...list, { steamid: '', name: '' }])}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-gray-700 text-xs font-bold text-gray-400 hover:text-primary hover:border-primary/50 transition-all"
              >
                <UserPlus size={14} /> {t('Добавить игрока', 'Add player')}
              </button>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-xl text-sm font-medium flex items-start gap-2 border bg-red-500/10 text-red-500 border-red-500/20">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span className="min-w-0 break-words">{error}</span>
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6 pt-0 sm:pt-0 flex gap-3">
          <button type="button" onClick={onClose} className={cn(BTN, 'flex-1 bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50')}>{t('Отмена', 'Cancel')}</button>
          <button type="button" disabled={busy || !name.trim()} onClick={save} className={cn(BTN, 'flex-1 bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20')}>
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : t('Сохранить', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export const teamInitials = (team: { name: string; tag?: string }) =>
  (team.tag?.trim() || team.name.trim().split(/\s+/).map((w) => w[0]).join('')).slice(0, 3).toUpperCase() || '?';

// Quatrix design tokens, the same as on the Match setup page
const CARD = 'bg-card rounded-2xl border border-gray-800 shadow-2xl';
const BTN = 'inline-flex items-center justify-center gap-2 px-5 py-1.5 text-sm rounded-xl font-bold h-[38px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const ICON_BTN = 'flex items-center justify-center p-2 rounded-xl border border-gray-800 text-gray-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all shrink-0';
const LABEL = 'block text-xs font-bold text-gray-400 mb-2';
const INPUT = 'w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600';
const INPUT_SM = 'w-full min-w-0 bg-background/50 border border-gray-800 rounded-xl px-3 h-[38px] text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600';
