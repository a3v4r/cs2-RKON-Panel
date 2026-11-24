"use client";

import React from 'react';
import { MessageSquare, Hash, RefreshCw, Search, PlugZap, Check, Terminal } from 'lucide-react';
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
const TEAM_CHIP: Record<string, string> = {
  CT: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  TERRORIST: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
};

const iconBtn = 'flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group p-2 rounded-xl w-[34px] h-[34px] shrink-0 bg-card border border-gray-800 hover:border-primary/50 text-gray-400 hover:text-primary shadow-xl';

// `footer`: message box under the history
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

  // ask the server to send its log (with chat) here; safe to repeat
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
    // panel-started servers get log settings in cfg, others over RCON
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

  // autoscroll unless scrolled up
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
      // id stays visible to copy by hand
    }
  };

  const time = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleString(locale, opts);
  const filterBy = (name: string) => setSearch(name);

  return (
    <section className="bg-card rounded-2xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden h-[70dvh] xl:h-[calc(100dvh-10rem)] min-h-[460px] min-w-0">
      <div className="p-4 sm:px-6 border-b border-gray-800/60 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 mr-auto">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0"><MessageSquare size={18} /></div>
          <div className="min-w-0">
            <h3 className="text-xs font-black text-white uppercase tracking-wider truncate">{t('Игровой чат', 'Game chat')}</h3>
            <div className="mt-0.5 text-[9px] font-bold uppercase tracking-widest truncate">
              {attach.state === 'ok' && <span className="inline-flex items-center gap-1.5 text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{t('Чат подключён', 'Chat connected')}</span>}
              {attach.state === 'busy' && <span className="text-gray-500">{t('Подключение чата...', 'Connecting chat...')}</span>}
              {attach.state === 'error' && <span className="text-red-400" title={attach.error}>{t('Чат не подключён', 'Chat not connected')}: {attach.error}</span>}
              {attach.state === 'idle' && <span className="text-gray-500">{t('все и командный чат', 'all and team chat')}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative group flex-1 sm:w-56">
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
            {attach.state === 'busy' ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current/20 border-t-current" /> : <PlugZap className="w-4 h-4" />}
          </button>
          <button onClick={refresh} disabled={loading} className={iconBtn} title={t('Обновить', 'Refresh')} aria-label={t('Обновить', 'Refresh')}>
            {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current/20 border-t-current" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar bg-black/40">
        {shown.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4 py-10">
            <div className="p-4 rounded-2xl bg-primary/10 text-primary"><MessageSquare size={28} /></div>
            <p className="text-sm font-medium text-center">
              {q
                ? t('Нет сообщений, подходящих под поиск', 'No messages matching your search')
                : t('Сообщений пока нет: здесь появится чат игроков', 'No messages yet: the players\' chat will show up here')}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {shown.map((m, i) => {
              const fromConsole = m.team === 'Console';
              return (
                <div key={`${m.t}-${i}`} className="group flex items-start gap-3 p-2.5 sm:p-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                  <button
                    type="button"
                    onClick={() => filterBy(m.name)}
                    className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 text-xs font-black transition-transform hover:scale-105 active:scale-95', fromConsole ? 'bg-primary/10 text-primary border-primary/30' : TEAM_CHIP[m.team] ?? 'bg-gray-800 text-gray-300 border-gray-700')}
                    title={t('Фильтр по этому игроку', 'Filter by this user')}
                  >
                    {fromConsole ? <Terminal size={15} /> : (m.name.trim().charAt(0).toUpperCase() || '?')}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => filterBy(m.name)}
                        className={cn('font-bold text-sm truncate hover:underline underline-offset-2', fromConsole ? 'text-primary' : TEAM_COLOR[m.team] ?? 'text-slate-200')}
                        title={t('Фильтр по этому игроку', 'Filter by this user')}
                      >
                        {fromConsole ? t('Панель / консоль', 'Panel / console') : m.name}
                      </button>
                      <span className={cn('shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border uppercase font-bold tracking-wider', m.type === 'say_team' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-gray-400 bg-gray-500/10 border-gray-500/20')}>
                        {m.type === 'say_team' ? t('Команде', 'Team') : t('Всем', 'All')}
                      </span>
                      {/^\d{17}$/.test(m.steamid) && (
                        <button
                          type="button"
                          onClick={() => copy(m.steamid)}
                          className="hidden sm:inline-flex items-center gap-1 min-w-0 text-[10px] font-mono text-gray-500 hover:text-primary transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title={t('Скопировать SteamID64', 'Copy SteamID64')}
                        >
                          {copied === m.steamid ? <Check size={11} className="text-emerald-400 shrink-0" /> : <Hash size={11} className="shrink-0" />}
                          <span className="truncate">{m.steamid}</span>
                        </button>
                      )}
                      <span className="text-[11px] text-gray-500 font-mono ml-auto shrink-0" title={time(m.t, { dateStyle: 'medium', timeStyle: 'medium' })}>
                        {time(m.t, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-slate-200 text-sm leading-relaxed break-words">{m.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {footer && <div className="border-t border-gray-800/60 p-3 sm:p-4">{footer}</div>}
    </section>
  );
}
