"use client";

import React from 'react';
import { ChevronDown, Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lang, useT } from '@/lib/i18n';

const LANGS: { id: Lang; flag: string; label: string }[] = [
  { id: 'ru', flag: '🇷🇺', label: 'Русский' },
  { id: 'en', flag: '🇬🇧', label: 'English' },
];

// Language dropdown, styled as the one on the Quatrix dashboard
export function LanguageMenu() {
  const { lang, setLang, t } = useT();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 rounded-xl border transition-all duration-300 group active:scale-95',
          open ? 'bg-primary/10 border-primary/30 text-white' : 'bg-white/5 border-gray-800 text-gray-400 hover:border-white/10 hover:bg-white/10',
        )}
        title={t('Язык', 'Language')}
        aria-label={t('Язык', 'Language')}
        aria-expanded={open}
      >
        <div className={cn('p-1 rounded-lg transition-colors', open ? 'bg-primary text-white' : 'bg-primary/10 text-primary group-hover:bg-primary/20')}>
          <Languages size={15} />
        </div>
        <ChevronDown size={12} className={cn('transition-transform duration-300', open ? 'rotate-180 text-primary' : 'text-gray-500')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-40 bg-sidebar/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-2 space-y-1">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { setLang(l.id); setOpen(false); }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all',
                    lang === l.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{l.flag}</span>
                    <span className="text-xs font-bold uppercase tracking-wider">{l.label}</span>
                  </div>
                  {lang === l.id && <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_white]" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
