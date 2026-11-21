"use client";

import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption<V extends string | number> {
  value: V;
  label: string;
}

interface CustomSelectProps<V extends string | number> {
  options: SelectOption<V>[];
  value: V;
  onChange: (value: V) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

// The Quatrix CustomSelect: a button with the chosen option and a dropdown list under it
export function CustomSelect<V extends string | number>({ options, value, onChange, placeholder, icon, size = 'md', className }: CustomSelectProps<V>) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.value === value);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={ref} className={cn('relative text-left', size === 'sm' && 'h-full', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(
          'w-full bg-background/50 border border-gray-800 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-all hover:border-gray-700 outline-none focus:outline-none focus-visible:outline-none text-left',
          size === 'sm' ? 'h-full px-3 py-1.5 rounded-lg' : 'px-4 py-3',
          open && 'ring-2 ring-primary border-transparent',
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-gray-500 shrink-0">{icon}</span>}
          <span className={cn('truncate font-medium', size === 'sm' ? 'text-xs' : 'text-sm', active ? 'text-gray-200' : 'text-gray-500')}>
            {active?.label ?? placeholder ?? ''}
          </span>
        </span>
        <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-[100] w-full min-w-[12rem] right-0 mt-2 bg-background border border-gray-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
          <div className="max-h-64 overflow-y-auto">
            {options.map((o) => (
              <div
                key={String(o.value)}
                role="option"
                aria-selected={o.value === value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  'px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-2 hover:bg-white/5 transition-colors',
                  o.value === value ? 'text-primary bg-primary/5 font-bold' : 'text-gray-300',
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check className="w-4 h-4 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
