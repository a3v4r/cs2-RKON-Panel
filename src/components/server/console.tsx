"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Terminal as TerminalIcon, ChevronRight, History, Trash2, Copy, Check, Play, RotateCcw, Pause, PlayCircle, ArrowDown, Send, Zap, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyText } from '@/lib/clipboard';
import { useT } from '@/lib/i18n';
import { controlCommands } from '@/lib/vanilla';

// Command history survives tab switches and reloads (on phones there are no arrow keys to recall it)
const HISTORY_KEY = 'cs2panel.console.history';

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

// Autocomplete list, as Quatrix config/consoleCommands.ts, with the commands a referee needs.
// A trailing space means the command takes an argument.
const COMMON_COMMANDS = [
  // MatchZy
  'css_start',
  'css_forcepause',
  'css_forceunpause',
  'css_restore ',
  'css_stop',
  'get5_status',
  'matchzy_loadmatch_url ',
  // Match control
  'mp_restartgame 1',
  'mp_warmup_start',
  'mp_warmup_end',
  'mp_pause_match',
  'mp_unpause_match',
  'mp_swapteams',
  'mp_backup_restore_list_files',
  'mp_backup_restore_load_file ',
  'mp_teamname_1 ',
  'mp_teamname_2 ',
  'mp_maxrounds ',
  'mp_roundtime ',
  'mp_freezetime ',
  // GOTV
  'tv_status',
  'tv_record ',
  // Server and maps
  'status',
  'changelevel ',
  'map ',
  'host_workshop_map ',
  'say ',
  'bot_kick',
  'sv_password ',
  'exec ',
].sort();

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'command' | 'response' | 'error';
  content: string;
}

interface RCONConsoleProps {
  onSendCommand: (command: string) => Promise<string>;
  // Server without MatchZy: start and pauses by plain cvars
  vanilla?: boolean;
}

// Quatrix IconButton, variant ghost, size sm
const headerBtn = 'flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group p-1.5 rounded-lg w-8 h-8 text-gray-400 hover:text-white hover:bg-white/5';

const newId = () => Math.random().toString(36).slice(2, 11);
const now = () => new Date().toLocaleTimeString('ru-RU'); // 24-hour HH:MM:SS in both languages

export function RCONConsole({ onSendCommand, vanilla }: RCONConsoleProps) {
  const control = controlCommands(vanilla ? 'vanilla' : 'matchzy');
  const { t } = useT();
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openedAt] = useState(now);
  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // not critical
    }
  }, [history]);

  // Follow new lines unless the referee scrolled up to read
  useEffect(() => {
    if (isAutoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs, isAutoScroll]);

  const handleScroll = () => {
    if (consoleRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = consoleRef.current;
      setIsAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
    }
  };

  const suggestions = useMemo(() => {
    const val = input.toLowerCase();
    if (!val.trim() || dismissed) return [];
    return COMMON_COMMANDS.filter((cmd) => cmd.toLowerCase().startsWith(val) && cmd.toLowerCase() !== val).slice(0, 8);
  }, [input, dismissed]);

  const setCommand = (value: string) => {
    setInput(value);
    setDismissed(false);
  };

  const execute = async (command: string) => {
    // Add to history
    setHistory((prev) => {
      const next = [...prev.filter((c) => c !== command), command];
      if (next.length > 50) next.shift();
      return next;
    });
    setHistoryIndex(-1);
    setLogs((prev) => [...prev, { id: newId(), timestamp: now(), type: 'command', content: command }]);

    try {
      const response = await onSendCommand(command);
      setLogs((prev) => [...prev, {
        id: newId(),
        timestamp: now(),
        type: 'response',
        content: response || t('Выполнено (сервер ничего не ответил)', 'Done (no response from the server)'),
      }]);
    } catch (error: any) {
      setLogs((prev) => [...prev, {
        id: newId(),
        timestamp: now(),
        type: 'error',
        content: error?.message || t('Неизвестная ошибка RCON', 'Unknown RCON error'),
      }]);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const command = input.trim();
    if (!command) return;
    setCommand('');
    setIsAutoScroll(true);
    execute(command);
  };

  const quick = async (command: string) => {
    setBusy(true);
    setIsAutoScroll(true);
    try {
      await execute(command);
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const atEnd = e.currentTarget.selectionStart === input.length;
    if ((e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd)) && suggestions.length > 0) {
      e.preventDefault();
      setCommand(suggestions[0]);
    } else if (e.key === 'Escape') {
      setDismissed(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        setCommand(history[history.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(history[history.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  const typeLabel = (type: LogEntry['type']) =>
    type === 'command' ? <span className="text-blue-400 mr-2">INFO:</span>
      : type === 'error' ? <span className="text-red-400 mr-2">ERROR:</span>
      : null;

  // A command from the lists goes into the input; the judge checks it and presses Enter
  const insert = (command: string) => {
    setCommand(command);
    setHistoryIndex(-1);
    inputRef.current?.focus();
  };

  const quickActions = [
    { command: control.start, label: t('Старт матча', 'Start match'), icon: <Play size={18} />, className: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30 border-transparent' },
    { command: 'mp_restartgame 1', label: t('Рестарт', 'Restart'), icon: <RotateCcw size={18} className={busy ? 'animate-spin' : ''} />, className: 'bg-white/5 hover:bg-white/10 border-gray-800' },
    { command: control.pause, label: t('Пауза', 'Pause'), icon: <Pause size={18} />, className: 'bg-amber-500 hover:bg-amber-400 !text-black shadow-amber-900/30 border-transparent' },
    { command: control.unpause, label: t('Снять паузу', 'Unpause'), icon: <PlayCircle size={18} />, className: 'bg-primary hover:bg-primary/90 shadow-primary/20 border-transparent' },
  ];

  return (
    <div className="grid gap-4 md:gap-6 xl:grid-cols-3 items-start animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Console window, a card as on the Match page */}
      <section className={cn(card, 'xl:col-span-2 flex flex-col overflow-hidden h-[65dvh] xl:h-[calc(100dvh-10rem)] min-h-[420px] min-w-0')}>
        <div className="p-4 sm:px-6 border-b border-gray-800/60 flex items-center justify-between gap-3">
          <CardHeader icon={<TerminalIcon size={18} />} title={t('Живая консоль сервера', 'Server Live Console')} subtitle={t('команды RCON и ответы сервера', 'RCON commands and server replies')} />
          <div className="flex items-center gap-1 shrink-0">
            {!isAutoScroll && (
              <button
                onClick={() => setIsAutoScroll(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 mr-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all animate-pulse"
              >
                <ArrowDown size={11} /> {t('К новым строкам', 'Catch up')}
              </button>
            )}
            <button onClick={() => setLogs([])} className={headerBtn} title={t('Очистить', 'Clear')} aria-label={t('Очистить', 'Clear')}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div
          ref={consoleRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 sm:p-6 font-mono text-[13px] leading-relaxed custom-scrollbar bg-black/40"
        >
          <div className="space-y-1">
            {logs.length === 0 && (
              <div className="flex gap-3">
                <span className="hidden sm:inline text-slate-500 shrink-0 select-none">[{openedAt}]</span>
                <p className="break-all">
                  <span className="text-blue-400 mr-2">INFO:</span>
                  <span className="whitespace-pre-wrap">
                    {t('Введите команду, чтобы отправить её на сервер...', 'Type a command to send it to the server...')}
                  </span>
                </p>
              </div>
            )}
            {logs.map((log) => (
              <div key={log.id} className="group relative flex gap-3 pr-6">
                <span className="hidden sm:inline text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                <p className="break-all min-w-0">
                  {typeLabel(log.type)}
                  <span className={cn('whitespace-pre-wrap', log.type === 'response' && 'text-slate-300', log.type === 'command' && 'text-white')}>
                    {log.type === 'command' ? `> ${log.content}` : log.content}
                  </span>
                </p>
                <button
                  onClick={async () => { await copyText(log.content); setCopiedId(log.id); setTimeout(() => setCopiedId(null), 1500); }}
                  className="absolute top-0.5 right-0 md:opacity-0 md:group-hover:opacity-100 p-0.5 text-slate-500 hover:text-white transition-opacity"
                  title={t('Копировать', 'Copy')}
                  aria-label={t('Копировать', 'Copy')}
                >
                  {copiedId === log.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Command input, the Quatrix input field with the send button next to it */}
        <form onSubmit={handleSend} className="p-3 sm:p-4 border-t border-gray-800/60 flex items-center gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0 group">
            <ChevronRight className="absolute left-3 top-1/2 -translate-y-1/2 text-primary w-4 h-4 pointer-events-none" />
            {/* Ghost suggestion */}
            {input && suggestions.length > 0 && (
              <div className="absolute left-9 right-3 top-1/2 -translate-y-1/2 text-sm font-mono pointer-events-none text-slate-600 whitespace-pre overflow-hidden">
                <span className="opacity-0">{input}</span>
                {suggestions[0].slice(input.length)}
              </div>
            )}
            <input
              ref={inputRef}
              className="w-full h-11 bg-background/50 border border-gray-800 rounded-xl pl-9 pr-3 text-sm font-mono text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder={t('Введите команду консоли...', 'Type console command...')}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(e) => { setCommand(e.target.value); setHistoryIndex(-1); }}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="h-11 inline-flex items-center justify-center gap-2 px-4 sm:px-6 rounded-xl bg-primary hover:bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all shrink-0"
            aria-label={t('Отправить', 'Send')}
          >
            <Send size={16} /> <span className="hidden sm:inline">{t('Отправить', 'Send')}</span>
          </button>
        </form>
        <p className="hidden md:block px-6 pb-3 -mt-1 text-[10px] text-slate-500 font-mono">
          {t('[Tab] или [→] подставляет подсказку, [↑] [↓] листают историю', '[Tab] or [→] completes, [↑] [↓] go through the history')}
        </p>
      </section>

      <div className="space-y-4 md:space-y-6 min-w-0">
        {/* Quick referee commands, as the Overview quick actions */}
        <section className={cn(card, 'p-4 sm:p-6')}>
          <CardHeader icon={<Zap size={18} />} title={t('Быстрые действия', 'Quick actions')} subtitle={t('отправляются сразу', 'sent right away')} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            {quickActions.map((a) => (
              <button
                key={a.command}
                disabled={busy}
                onClick={() => quick(a.command)}
                title={a.command}
                className={cn('min-h-12 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-semibold text-white text-center shadow-lg active:scale-[0.98] transition-all disabled:opacity-50', a.className)}
              >
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        </section>

        {/* Frequent commands: a click puts the command into the input */}
        <section className={cn(card, 'p-4 sm:p-6')}>
          <CardHeader icon={<ListChecks size={18} />} title={t('Частые команды', 'Common commands')} subtitle={t('нажмите, чтобы вставить в строку', 'click to put into the input')} />
          <div className="mt-5 flex flex-wrap gap-2">
            {FREQUENT.map((cmd) => (
              <button
                key={cmd}
                onClick={() => insert(cmd)}
                className="px-3 py-1.5 rounded-lg bg-background/50 border border-gray-800 text-xs font-mono text-slate-300 hover:border-primary/50 hover:text-primary transition-all"
              >
                {cmd.trim()}
              </button>
            ))}
          </div>
        </section>

        {/* Command history, kept in this browser */}
        <section className={cn(card, 'overflow-hidden')}>
          <div className="p-4 sm:px-6 border-b border-gray-800/60 flex items-center justify-between gap-3">
            <CardHeader icon={<History size={18} />} title={t('История команд', 'Command history')} subtitle={t('нажмите, чтобы повторить', 'click to repeat')} />
            {history.length > 0 && (
              <button onClick={() => setHistory([])} className={headerBtn} title={t('Очистить историю', 'Clear history')} aria-label={t('Очистить историю', 'Clear history')}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-800/40">
            {history.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-gray-500">{t('Команд пока не было', 'No commands yet')}</p>
            )}
            {[...history].reverse().map((cmd) => (
              <button
                key={cmd}
                onClick={() => insert(cmd)}
                className="block w-full truncate px-4 sm:px-6 py-2.5 text-left font-mono text-xs text-slate-300 hover:bg-white/[0.02] hover:text-primary transition-colors"
              >
                {cmd}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// Card and header as on the Match page
const card = 'bg-card rounded-2xl border border-gray-800 shadow-2xl';

function CardHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">{icon}</div>
      <div className="min-w-0">
        <h3 className="text-xs font-black text-white uppercase tracking-wider truncate">{title}</h3>
        {subtitle && <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// Shown as chips on the side; a trailing space means the command takes an argument
const FREQUENT = ['status', 'get5_status', 'tv_status', 'mp_warmup_end', 'mp_restartgame 1', 'css_restore ', 'changelevel ', 'say ', 'mp_maxrounds ', 'bot_kick'];
