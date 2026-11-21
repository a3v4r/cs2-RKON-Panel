"use client";

import React from 'react';
import { MessageSquare, User, Clock, Hash, RefreshCw, Search, PlugZap, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { copyText } from '@/lib/clipboard';
import { useT } from '@/lib/i18n';

interface ChatMessage {
  t: number;
  name: string;
  steamid: string;
  team: string;
  type: 'say' | 'say_team';
  text: string;
}

const KEEP = 500;
const POLL_MS = 2000;

const TEAM_COLOR: Record<string, string> = {
  CT: 'text-sky-400',
  TERRORIST: 'text-amber-400',
};

// Quatrix IconButton, variant secondary, size md
const iconBtn = 'flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group p-2 rounded-xl w-[34px] h-[34px] shrink-0 bg-card border border-gray-800 hover:border-primary/50 text-gray-400 hover:text-primary shadow-xl';

// Live in-game chat, laid out as the Quatrix chat page: avatar, name (click = filter), ALL/TEAM, time, message.
// `footer` is the message box under the history.
export function ChatHistory({ serverId, managed, footer }: { serverId: number; managed?: boolean; footer?: React.ReactNode }) {
  const { t, locale } = useT();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [attach, setAttach] = React.useState<{ state: 'idle' | 'busy' | 'ok' | 'error'; error?: string }>({ state: 'idle' });
  const [copied, setCopied] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const lastRef = React.useRef(0);
  const stickRef = React.useRef(true);

  const poll = React.useCallback(async (full = false) => {
    if (full) lastRef.current = 0;
    const fresh = await api<ChatMessage[]>(`/api/servers/${serverId}/chat?since=${lastRef.current}`).catch(() => null);
    if (!fresh) return;
    if (fresh.length) lastRef.current = fresh[fresh.length - 1].t;
    setMessages((prev) => (full ? fresh : fresh.length ? [...prev, ...fresh].slice(-KEEP) : prev));
  }, [serverId]);

  // Ask the game server to send its log (with the chat) to the panel; harmless to repeat
  const connect = React.useCallback(async () => {
    setAttach({ state: 'busy' });
    try {
      await api(`/api/servers/${serverId}/chat`, { body: {} });
      setAttach({ state: 'ok' });
    } catch (e) {
      setAttach({ state: 'error', error: (e as Error).message });
    }
  }, [serverId]);

  React.useEffect(() => {
    poll(true);
    // A server the panel starts gets the log settings in its cfg; others are asked over RCON
    if (managed) setAttach({ state: 'ok' });
    else connect();
    const timer = setInterval(() => poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll, connect, managed]);

  const refresh = async () => {
    setLoading(true);
    try { await poll(true); } finally { setLoading(false); }
  };

  const q = search.trim().toLowerCase();
  const shown = q
    ? messages.filter((m) => m.name.toLowerCase().includes(q) || m.text.toLowerCase().includes(q) || m.steamid.toLowerCase().includes(q))
    : messages;

  // Follow new messages unless the referee scrolled up to read
  React.useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);
  const onScroll = () => {
    const el = listRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const copy = async (id: string) => {
    try {
      await copyText(id);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // nothing to show: the id stays visible to copy by hand
    }
  };

  const time = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleString(locale, opts);
  const filterBy = (name: string) => setSearch(name);

  return (
    <div className="space-y-6">
      {/* Header controls of the Quatrix chat page (SearchInput w-64 + IconButton refresh), plus the chat log connection */}
      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex items-center gap-2 mr-auto text-xs min-w-0">
          {attach.state === 'ok' && <span className="flex items-center gap-1.5 text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{t('Чат подключён', 'Chat connected')}</span>}
          {attach.state === 'busy' && <span className="text-gray-500">{t('Подключение чата...', 'Connecting chat...')}</span>}
          {attach.state === 'error' && <span className="text-red-400 truncate max-w-[260px]" title={attach.error}>{t('Чат не подключён', 'Chat not connected')}: {attach.error}</span>}
        </div>
        <div className="relative group w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-primary transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Фильтр по нику, сообщению...', 'Filter by name, message...')}
            className="w-full pl-10 pr-4 py-1.5 bg-background/50 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200 placeholder-gray-600 h-[34px]"
          />
        </div>
        <button
          onClick={connect}
          disabled={attach.state === 'busy'}
          className={iconBtn}
          title={t('Заново попросить сервер присылать лог чата в панель', 'Ask the server again to send its chat log to the panel')}
          aria-label={t('Переподключить', 'Reconnect')}
        >
          {attach.state === 'busy' ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current/20 border-t-current" />
          ) : (
            <PlugZap className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={refresh}
          disabled={loading}
          className={iconBtn}
          title={t('Обновить', 'Refresh')}
          aria-label={t('Обновить', 'Refresh')}
        >
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current/20 border-t-current" />
          ) : (
            <RefreshCw className="w-4 h-4 transition-transform duration-500 group-active:rotate-180" />
          )}
        </button>
      </div>

      {/* Chat Area */}
      <div className="bg-[#0d1421] border border-gray-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        <div ref={listRef} onScroll={onScroll} className="h-[420px] md:h-[480px] overflow-y-auto p-4 flex flex-col custom-scrollbar">
          <div className="space-y-4 pb-2">
            {shown.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-gray-500 gap-4">
                <div className="w-16 h-16 rounded-full bg-gray-800/20 flex items-center justify-center">
                  <MessageSquare size={32} />
                </div>
                <p className="text-sm font-medium text-center">
                  {q
                    ? t('Нет сообщений, подходящих под поиск', 'No messages matching your search')
                    : t('Для этого сервера история чата не найдена', 'No chat history found for this server')}
                </p>
              </div>
            ) : (
              shown.map((m, i) => (
                <div key={`${m.t}-${i}`} className="group animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-gray-800">
                    {/* Avatar placeholder */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => filterBy(m.name)}
                      onKeyDown={(e) => { if (e.key === 'Enter') filterBy(m.name); }}
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center shrink-0 border border-gray-700 group-hover:border-primary/50 transition-colors cursor-pointer hover:scale-105 active:scale-95 overflow-hidden"
                      title={t('Фильтр по этому игроку', 'Filter by this user')}
                    >
                      <User className="text-gray-400 w-5 h-5 group-hover:text-primary transition-colors" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          onClick={() => filterBy(m.name)}
                          className={cn('font-bold truncate max-w-[200px] cursor-pointer hover:text-primary hover:underline underline-offset-2 transition-all', TEAM_COLOR[m.team] ?? 'text-slate-200')}
                          title={t('Фильтр по этому игроку', 'Filter by this user')}
                        >
                          {m.name}
                        </span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider', m.type === 'say_team' ? 'text-emerald-400 bg-emerald-400/10' : 'text-primary bg-primary/10')}>
                          {m.type === 'say_team' ? t('КОМАНДА', 'TEAM') : t('ВСЕ', 'ALL')}
                        </span>
                        <span className="text-[11px] text-gray-500 font-mono mt-0.5 ml-auto">
                          {time(m.t, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <p className="text-slate-300 text-sm leading-relaxed break-words bg-[#111827]/50 p-2.5 rounded-lg border border-gray-800/50">
                        {m.text}
                      </p>

                      <div className="mt-2 flex items-center gap-3 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-primary transition-colors cursor-help" title={time(m.t, { dateStyle: 'medium', timeStyle: 'medium' })}>
                          <Clock size={12} />
                          {time(m.t, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </div>
                        {/^\d{17}$/.test(m.steamid) && (
                          <div
                            onClick={() => copy(m.steamid)}
                            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-primary transition-colors cursor-copy"
                            title={t('Скопировать SteamID64', 'Copy SteamID64')}
                          >
                            {copied === m.steamid ? <Check size={12} className="text-emerald-400" /> : <Hash size={12} />}
                            {m.steamid}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {footer && <div className="border-t border-gray-800 p-4 bg-card">{footer}</div>}
      </div>
    </div>
  );
}
