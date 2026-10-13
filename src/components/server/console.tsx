"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Send, ChevronRight, History, Trash2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { copyText } from '@/lib/clipboard';

// Command history survives tab switches and reloads (on phones there are no arrow keys to recall it)
const HISTORY_KEY = 'cs2panel.console.history';

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'command' | 'response' | 'error';
  content: string;
}

interface RCONConsoleProps {
  onSendCommand: (command: string) => Promise<string>;
}

export function RCONConsole({ onSendCommand }: RCONConsoleProps) {
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // not critical
    }
  }, [history]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const command = input.trim();
    
    // Add to history
    setHistory(prev => {
      const newHistory = [...prev.filter(c => c !== command), command];
      // Limit history size
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(-1);

    const commandLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'command',
      content: command,
    };

    setLogs(prev => [...prev, commandLog]);
    setInput('');
    
    try {
      const response = await onSendCommand(command);
      const responseLog: LogEntry = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'response',
        content: response || 'Command executed (no output)',
      };
      setLogs(prev => [...prev, responseLog]);
    } catch (error: any) {
      const errorLog: LogEntry = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        content: error.message || 'Unknown RCON error',
      };
      setLogs(prev => [...prev, errorLog]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  const clearLogs = () => setLogs([]);

  return (
    <div className="flex flex-col h-full bg-[#09090b] border border-border rounded-xl overflow-hidden">
      {/* Console Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-white/5">
        <div className="flex items-center text-sm font-medium text-white/90">
          <TerminalIcon size={16} className="mr-2 text-primary" />
          RCON Terminal
        </div>
        <div className="flex items-center space-x-1">
          <button onClick={clearLogs} className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground transition-colors" title="Clear Console">
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn("p-1.5 rounded-md hover:bg-white/10 transition-colors", showHistory ? "text-primary" : "text-muted-foreground")}
            title="Command History"
          >
            <History size={14} />
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="max-h-48 overflow-auto border-b border-border bg-black/30 p-2 space-y-1">
          {history.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground italic">No commands yet</div>}
          {[...history].reverse().map((cmd) => (
            <button
              key={cmd}
              onClick={() => { setInput(cmd); setShowHistory(false); inputRef.current?.focus(); }}
              className="block w-full truncate rounded px-2 py-1.5 text-left font-mono text-xs text-white/80 hover:bg-white/10"
            >
              {cmd}
            </button>
          ))}
        </div>
      )}

      {/* Logs Area */}
      <ScrollArea className="flex-1 p-4 font-mono text-xs overflow-auto">
        <div className="space-y-3">
          {logs.length === 0 && (
            <div className="text-muted-foreground/30 text-center py-20 italic">
              Terminal ready. Type a command to begin...
            </div>
          )}
          {logs.map((log) => (
            <div key={log.id} className={cn(
              "group relative flex flex-col space-y-1 p-2 rounded-md border border-transparent hover:border-border transition-all",
              log.type === 'command' ? "bg-white/5 border-white/5" : ""
            )}>
              <div className="flex items-center justify-between text-[10px]">
                <span className={cn(
                   "font-bold uppercase tracking-widest",
                   log.type === 'command' ? "text-primary" : log.type === 'error' ? "text-red-500" : "text-emerald-500"
                )}>
                  {log.type === 'command' ? '> SEND' : log.type === 'error' ? 'ERROR' : 'RESPONSE'}
                </span>
                <span className="text-muted-foreground/50">{log.timestamp}</span>
              </div>
              <div className={cn(
                "whitespace-pre-wrap break-all leading-relaxed",
                log.type === 'command' ? "text-white font-semibold" : "text-muted-foreground"
              )}>
                {log.content}
              </div>
              <button
                onClick={async () => { await copyText(log.content); setCopiedId(log.id); setTimeout(() => setCopiedId(null), 1500); }}
                className="absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 p-1 text-muted-foreground hover:text-white transition-opacity"
                title="Copy"
              >
                {copiedId === log.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 bg-white/5 border-t border-border flex items-center space-x-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary text-primary-foreground shrink-0">
          <ChevronRight size={18} />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type RCON command (e.g. status, mp_restartgame 1)..."
          className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-muted-foreground/50"
          autoFocus
        />
        <button 
          onClick={handleSend}
          disabled={!input.trim()}
          className="p-2 rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:hover:bg-primary/10 disabled:hover:text-primary transition-all"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
