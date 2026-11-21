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
import { Role } from '@/lib/api';
import { Text, useT } from '@/lib/i18n';

export type Section = 'dashboard' | 'servers' | 'live' | 'console' | 'chat' | 'maps' | 'match' | 'settings' | 'general-settings';

export const SECTIONS: Record<Section, { label: Text; hint: Text; icon: LucideIcon }> = {
  dashboard: { label: { ru: 'Обзор', en: 'Overview' }, hint: { ru: 'Состояние сервера и быстрые действия', en: 'Server status and quick actions' }, icon: LayoutDashboard },
  servers: { label: { ru: 'Серверы', en: 'Servers' }, hint: { ru: 'Все серверы панели: состояние, запуск и настройки', en: 'All panel servers: status, start and settings' }, icon: Layers },
  live: { label: { ru: 'Матч', en: 'Match' }, hint: { ru: 'Счёт, раунды, статистика и откат раунда', en: 'Score, rounds, stats and round restore' }, icon: Activity },
  console: { label: { ru: 'Консоль', en: 'Console' }, hint: { ru: 'RCON-команды на сервер', en: 'RCON commands to the server' }, icon: Terminal },
  chat: { label: { ru: 'Чат', en: 'Chat' }, hint: { ru: 'Сообщения в игровой чат и автосообщения', en: 'In-game chat messages and auto messages' }, icon: MessageSquare },
  maps: { label: { ru: 'Карты', en: 'Maps' }, hint: { ru: 'Смена карты', en: 'Change the map' }, icon: MapIcon },
  match: { label: { ru: 'Запуск матча', en: 'Match setup' }, hint: { ru: 'Конфиг MatchZy и запуск', en: 'MatchZy config and launch' }, icon: Trophy },
  settings: { label: { ru: 'Настройки сервера', en: 'Server settings' }, hint: { ru: 'Подключение и параметры сервера', en: 'Connection and server parameters' }, icon: SlidersHorizontal },
  'general-settings': { label: { ru: 'Настройки панели', en: 'Panel settings' }, hint: { ru: 'Журнал действий и версия панели', en: 'Action log and panel version' }, icon: Settings },
};

export const ROLE_TEXT: Record<Role, Text> = {
  judge: { ru: 'Судья', en: 'Referee' },
  broadcast: { ru: 'Трансляция', en: 'Broadcast' },
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
  const { t, lang } = useT();
  const role = ROLE_TEXT[user.role][lang];
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
            <div className="text-[11px] text-muted-foreground leading-tight">{t('панель судьи CS2', 'CS2 referee panel')}</div>
          </div>
        </div>
        <button onClick={onClose} className="md:hidden p-1.5 text-muted-foreground hover:text-white" aria-label={t('Закрыть меню', 'Close menu')}>
          <X size={20} />
        </button>
      </div>

      {/* Sections */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto" aria-label={t('Разделы', 'Sections')}>
        {NAV.map((id) => (
          <NavItem key={id} section={id} active={activeSection === id || (id === 'servers' && activeSection === 'settings')} onClick={() => onSelectSection(id)} />
        ))}
        <div className="pt-4 pb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{t('Панель', 'Panel')}</div>
        <NavItem section="general-settings" active={activeSection === 'general-settings'} onClick={() => onSelectSection('general-settings')} />
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="w-10 h-10 shrink-0 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-primary">
            {role.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{role}</div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t('в сети', 'online')}
            </div>
          </div>
          <button
            onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title={t('Выйти', 'Log out')}
            aria-label={t('Выйти', 'Log out')}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ section, active, onClick }: { section: Section; active: boolean; onClick: () => void }) {
  const { lang } = useT();
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
      <span className="font-medium">{label[lang]}</span>
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
