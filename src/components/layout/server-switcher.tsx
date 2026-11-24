"use client";

import React from 'react';
import { ChevronDown, Server, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServerProfile } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { getFlagEmoji } from './sidebar';

interface ServerSwitcherProps {
  servers: ServerProfile[];
  activeServerId: number | null;
  onSelect: (id: number) => void;
  className?: string;
}

export function ServerSwitcher({ servers, activeServerId, onSelect, className }: ServerSwitcherProps) {
  const { t } = useT();
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
    <div ref={ref} className={cn('relative text-left', className)}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(
          'w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between gap-2 cursor-pointer transition-all hover:border-gray-700 outline-none focus:outline-none focus-visible:outline-none text-left',
          open && 'ring-2 ring-primary border-transparent',
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Server className="w-4 h-4 text-gray-500 shrink-0" />
          <span className={cn('truncate text-sm font-medium', active ? 'text-gray-200' : 'text-gray-500')}>
            {active?.name ?? t('Выберите сервер...', 'Select server...')}
          </span>
        </span>
        <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-[100] w-full mt-2 bg-background border border-gray-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
          <div className="max-h-64 overflow-y-auto">
            {servers.map((server) => (
              <div
                key={server.id}
                role="option"
                aria-selected={server.id === activeServerId}
                onClick={() => { onSelect(server.id!); setOpen(false); }}
                className={cn(
                  'px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-2 hover:bg-white/5 transition-colors',
                  server.id === activeServerId ? 'text-primary bg-primary/5 font-bold' : 'text-gray-300',
                )}
              >
                <span className="truncate">{server.name}</span>
                {server.id === activeServerId && <Check className="w-4 h-4 shrink-0" />}
              </div>
            ))}
            {servers.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">{t('Серверов нет', 'No servers')}</div>
            )}
          </div>
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
