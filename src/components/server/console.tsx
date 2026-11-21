"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Terminal as TerminalIcon, MoveRight, History, Trash2, Copy, Check, Play, RotateCcw, Pause, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyText } from '@/lib/clipboard';
import { useT } from '@/lib/i18n';

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
}

// Quatrix Button (size md) with the className="py-3.5" the console action row gives it
const actionBtn = 'flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap px-5 py-3.5 text-sm rounded-xl font-bold h-[34px]';
// Quatrix IconButton, variant ghost, size sm
const headerBtn = 'flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group p-1 rounded-lg w-7 h-7 text-gray-400 hover:text-white hover:bg-white/5';

const newId = () => Math.random().toString(36).slice(2, 11);
const now = () => new Date().toLocaleTimeString();

export function RCONConsole({ onSendCommand }: RCONConsoleProps) {
  const { t } = useT();
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
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

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Console Window */}
      <div className="flex-1 min-h-[360px] flex flex-col bg-[#0d1421] border border-gray-800 rounded-xl overflow-hidden shadow-2xl relative">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-3 bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <TerminalIcon className="text-primary w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold text-slate-200 truncate">
              {t('Живая консоль сервера', 'Server Live Console')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isAutoScroll && (
              <button
                onClick={() => setIsAutoScroll(true)}
                className="hidden sm:block text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/30 transition-all animate-pulse"
              >
                {t('Автопрокрутка на паузе - нажмите, чтобы догнать', 'Auto-scroll Paused - Click to catch up')}
              </button>
            )}
            <button onClick={() => setLogs([])} className={headerBtn} title={t('Очистить', 'Clear')} aria-label={t('Очистить', 'Clear')}>
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(headerBtn, showHistory && 'text-primary hover:text-primary')}
              title={t('История команд', 'Command history')}
              aria-label={t('История команд', 'Command history')}
            >
              <History size={14} />
            </button>
          </div>
        </div>

        {showHistory && (
          <div className="max-h-48 overflow-y-auto border-b border-gray-800 bg-black/30 p-2 space-y-1">
            {history.length === 0 && (
              <div className="px-2 py-1 text-xs text-slate-500 font-mono">{t('Команд пока не было', 'No commands yet')}</div>
            )}
            {[...history].reverse().map((cmd) => (
              <button
                key={cmd}
                onClick={() => { setCommand(cmd); setShowHistory(false); inputRef.current?.focus(); }}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-xs text-slate-300 hover:bg-white/5 hover:text-primary transition-colors"
              >
                {cmd}
              </button>
            ))}
          </div>
        )}

        <div
          ref={consoleRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-5 font-mono text-sm custom-scrollbar bg-black/20"
        >
          <div className="space-y-1">
            {logs.length === 0 && (
              <div className="flex gap-3">
                <span className="text-slate-500 shrink-0 select-none">[{openedAt}]</span>
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
                <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                <p className="break-all min-w-0">
                  {typeLabel(log.type)}
                  <span className={cn('whitespace-pre-wrap', log.type === 'response' && 'text-slate-300')}>
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

        {/* Command Input */}
        <form onSubmit={handleSend} className="p-4 border-t border-gray-800 flex items-center gap-4 bg-card">
          <div className="flex-1 min-w-0 flex items-center gap-3 text-slate-400 relative group">
            <MoveRight className="text-primary w-5 h-5 shrink-0" />
            <div className="relative flex-1 min-w-0 flex items-center">
              {/* Ghost Suggestion */}
              {input && suggestions.length > 0 && (
                <div className="absolute left-0 top-0 text-sm font-mono p-0 pointer-events-none text-slate-600 whitespace-pre overflow-hidden max-w-full">
                  <span className="opacity-0">{input}</span>
                  {suggestions[0].slice(input.length)}
                </div>
              )}
              <input
                ref={inputRef}
                className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono placeholder:text-slate-600 p-0 outline-none text-white relative z-10"
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
            <div className="hidden md:group-focus-within:block shrink-0 text-[10px] text-slate-500 font-mono animate-pulse">
              {t('Нажмите [Tab] или [→] для подстановки', 'Press [Tab] or [→] to complete')}
            </div>
          </div>
          <button
            type="submit"
            className="bg-primary hover:bg-primary/90 text-white font-bold text-[10px] tracking-widest px-6 py-2 rounded transition-all shadow-lg shadow-primary/20 shrink-0"
          >
            {t('ОТПРАВИТЬ', 'SEND')}
          </button>
        </form>
      </div>

      {/* Quick referee commands, in the place and style of the Quatrix server action buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
        <button
          disabled={busy}
          onClick={() => quick('css_start')}
          className={cn(actionBtn, 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 active:scale-95')}
          title="css_start"
        >
          <span className="mr-2"><Play size={18} /></span>
          {t('Старт матча', 'Start match')}
        </button>
        <button
          disabled={busy}
          onClick={() => quick('mp_restartgame 1')}
          className={cn(actionBtn, 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50 active:scale-95')}
          title="mp_restartgame 1"
        >
          <span className="mr-2"><RotateCcw size={18} className={busy ? 'animate-spin' : ''} /></span>
          {t('Рестарт', 'Restart')}
        </button>
        <button
          disabled={busy}
          onClick={() => quick('css_forcepause')}
          className={cn(actionBtn, 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 active:scale-95')}
          title="css_forcepause"
        >
          <span className="mr-2"><Pause size={18} /></span>
          {t('Пауза', 'Pause')}
        </button>
        <button
          disabled={busy}
          onClick={() => quick('css_forceunpause')}
          className={cn(actionBtn, 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-95')}
          title="css_forceunpause"
        >
          <span className="mr-2"><PlayCircle size={18} /></span>
          {t('Снять паузу', 'Unpause')}
        </button>
      </div>
    </div>
  );
}
