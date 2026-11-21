"use client";

import React from 'react';
import {
  Settings,
  Terminal,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquare,
  Activity,
  Trophy,
  Layers,
  LogOut,
  Crosshair,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, Role } from '@/lib/api';

export type Section = 'dashboard' | 'servers' | 'live' | 'console' | 'chat' | 'maps' | 'match' | 'settings' | 'general-settings';

export const SECTIONS: Record<Section, { label: string; hint: string; icon: LucideIcon }> = {
  dashboard: { label: 'Обзор', hint: 'Состояние сервера и быстрые действия', icon: LayoutDashboard },
  servers: { label: 'Серверы', hint: 'Все серверы панели: состояние, запуск и настройки', icon: Layers },
  live: { label: 'Матч', hint: 'Счёт, раунды, статистика и откат раунда', icon: Activity },
  console: { label: 'Консоль', hint: 'RCON-команды на сервер', icon: Terminal },
  chat: { label: 'Чат', hint: 'Сообщения в игровой чат и автосообщения', icon: MessageSquare },
  maps: { label: 'Карты', hint: 'Смена карты', icon: MapIcon },
  match: { label: 'Запуск матча', hint: 'Конфиг MatchZy и запуск', icon: Trophy },
  settings: { label: 'Настройки сервера', hint: 'Подключение и параметры сервера', icon: SlidersHorizontal },
  'general-settings': { label: 'Настройки панели', hint: 'Журнал действий и версия панели', icon: Settings },
};

// Sections that work with one chosen server (the server is picked in their page header)
export const SERVER_SECTIONS: Section[] = ['dashboard', 'live', 'console', 'chat', 'maps', 'match', 'settings'];

const NAV: Section[] = ['dashboard', 'servers', 'live', 'console', 'chat', 'maps', 'match'];

interface SidebarProps {
  activeSection: Section;
  onSelectSection: (section: Section) => void;
  onClose: () => void;
  user: { role: Role };
}

export function Sidebar({ activeSection, onSelectSection, onClose, user }: SidebarProps) {
  return (
    <aside className="flex flex-col h-[100dvh] w-72 md:w-64 bg-sidebar text-muted-foreground border-r border-border">
      {/* Logo */}
      <div className="flex items-center justify-between gap-3 p-5 md:p-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center shadow-lg shadow-primary/30">
            <Crosshair size={22} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold text-white tracking-tight leading-tight">Matchdesk</div>
            <div className="text-[11px] text-muted-foreground leading-tight">панель судьи CS2</div>
          </div>
        </div>
        <button onClick={onClose} className="md:hidden p-1.5 text-muted-foreground hover:text-white" aria-label="Закрыть меню">
          <X size={20} />
        </button>
      </div>

      {/* Sections */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto" aria-label="Разделы">
        {NAV.map((id) => (
          <NavItem key={id} section={id} active={activeSection === id || (id === 'servers' && activeSection === 'settings')} onClick={() => onSelectSection(id)} />
        ))}
        <div className="pt-4 pb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Панель</div>
        <NavItem section="general-settings" active={activeSection === 'general-settings'} onClick={() => onSelectSection('general-settings')} />
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="w-10 h-10 shrink-0 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-primary">
            {ROLE_LABELS[user.role].slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{ROLE_LABELS[user.role]}</div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              в сети
            </div>
          </div>
          <button
            onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Выйти"
            aria-label="Выйти"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ section, active, onClick }: { section: Section; active: boolean; onClick: () => void }) {
  const { label, icon: Icon } = SECTIONS[section];
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left transition-all',
        active ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-white/5 hover:text-white',
      )}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </button>
  );
}

export function getFlagEmoji(countryCode: string) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
