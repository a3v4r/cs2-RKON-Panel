"use client";

import React from 'react';
import { ChevronDown, Server, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServerProfile } from '@/lib/db';
import { getFlagEmoji } from './sidebar';

interface ServerSwitcherProps {
  servers: ServerProfile[];
  activeServerId: number | null;
  online: boolean | null;
  onSelect: (id: number) => void;
  className?: string;
}

// "Switch server" dropdown in the header of every tool, as in Quatrix
export function ServerSwitcher({ servers, activeServerId, online, onSelect, className }: ServerSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const active = servers.find((s) => s.id === activeServerId);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-2.5 w-full md:w-64 h-10 px-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors text-left"
      >
        <Badge server={active} />
        <span className="flex-1 min-w-0 text-sm font-medium text-white truncate">{active?.name ?? 'Выберите сервер'}</span>
        {active && (
          <span className={cn('w-2 h-2 rounded-full shrink-0', online === null ? 'bg-muted-foreground' : online ? 'bg-emerald-400' : 'bg-red-400')} />
        )}
        <ChevronDown size={16} className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-full md:w-72 p-1.5 rounded-xl bg-popover border border-border shadow-2xl max-h-80 overflow-y-auto">
          {servers.map((server) => (
            <button
              key={server.id}
              onClick={() => { onSelect(server.id!); setOpen(false); }}
              className={cn(
                'flex items-center gap-3 w-full p-2 rounded-lg text-left transition-colors',
                server.id === activeServerId ? 'bg-primary/15 text-white' : 'text-muted-foreground hover:bg-white/5 hover:text-white',
              )}
            >
              <Badge server={server} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{server.name}</span>
                <span className="block text-[10px] opacity-60 truncate">{server.host}:{server.port}</span>
              </span>
              {server.id === activeServerId && <Check size={14} className="text-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Badge({ server, large }: { server?: ServerProfile; large?: boolean }) {
  return (
    <span className={cn('shrink-0 rounded-lg bg-white/5 flex items-center justify-center', large ? 'w-11 h-11 rounded-xl' : 'w-6 h-6')}>
      {server?.country_code ? (
        <span className={large ? 'text-xl leading-none' : 'text-sm leading-none'}>{getFlagEmoji(server.country_code)}</span>
      ) : (
        <Server size={large ? 20 : 14} className="text-muted-foreground" />
      )}
    </span>
  );
}
