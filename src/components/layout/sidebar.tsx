"use client";

import React from 'react';
import {
  Settings,
  Archive,
  UserCog,
  Terminal,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquare,
  Activity,
  Trophy,
  Layers,
  Users,
  Shield,
  LogOut,
  Crosshair,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, Role } from '@/lib/api';
import { Text, useT } from '@/lib/i18n';

export type Section = 'dashboard' | 'servers' | 'live' | 'console' | 'chat' | 'maps' | 'players' | 'match' | 'teams' | 'settings' | 'users' | 'backups' | 'general-settings';

// label: menu item; title: page heading when it differs (as the Quatrix page titles)
export const SECTIONS: Record<Section, { label: Text; title?: Text; hint: Text; icon: LucideIcon }> = {
  dashboard: { label: { ru: 'Обзор', en: 'Overview' }, hint: { ru: 'Состояние сервера и быстрые действия', en: 'Server status and quick actions' }, icon: LayoutDashboard },
  servers: { label: { ru: 'Серверы', en: 'Servers' }, hint: { ru: 'Все серверы панели: состояние, запуск и настройки', en: 'All panel servers: status, start and settings' }, icon: Layers },
  live: { label: { ru: 'Матч', en: 'Match' }, hint: { ru: 'Счёт, раунды, статистика и откат раунда', en: 'Score, rounds, stats and round restore' }, icon: Activity },
  console: { label: { ru: 'Консоль', en: 'Console' }, hint: { ru: 'RCON-команды на сервер', en: 'RCON commands to the server' }, icon: Terminal },
  chat: { label: { ru: 'Чат', en: 'Chat' }, hint: { ru: 'Сообщения в игровой чат и автосообщения', en: 'In-game chat messages and auto messages' }, icon: MessageSquare },
  maps: { label: { ru: 'Карты', en: 'Maps' }, title: { ru: 'Обозреватель карт', en: 'Map Explorer' }, hint: { ru: 'Запускайте карты и контент из Workshop на сервере', en: 'Deploy battlegrounds or workshop content to your node' }, icon: MapIcon },
  players: { label: { ru: 'Игроки', en: 'Players' }, title: { ru: 'Игроки', en: 'Player Management' }, hint: { ru: 'Игроки онлайн, журнал входов, кики и баны', en: 'Monitor live statistics, track join logs and manage server discipline.' }, icon: Users },
  match: { label: { ru: 'Запуск матча', en: 'Match setup' }, hint: { ru: 'MatchZy или Vanilla: правила и запуск', en: 'MatchZy or Vanilla: rules and launch' }, icon: Trophy },
  teams: { label: { ru: 'Команды', en: 'Teams' }, title: { ru: 'Библиотека команд', en: 'Team Library' }, hint: { ru: 'Сохранённые команды и составы по SteamID для запуска матчей', en: 'Saved teams and SteamID rosters for match setup' }, icon: Shield },
  settings: { label: { ru: 'Настройки сервера', en: 'Server settings' }, title: { ru: 'Настройки сервера', en: 'Server Settings' }, hint: { ru: 'Параметры сервера Counter-Strike 2 и его безопасность', en: 'Manage your Counter-Strike 2 server parameters and security protocols.' }, icon: SlidersHorizontal },
  users: { label: { ru: 'Пользователи', en: 'Users' }, title: { ru: 'Пользователи', en: 'User Management' }, hint: { ru: 'Личные аккаунты судей и трансляции', en: 'List and manage system users and their permissions.' }, icon: UserCog },
  backups: { label: { ru: 'Бэкапы', en: 'Backups' }, title: { ru: 'Управление бэкапами', en: 'Backup Management' }, hint: { ru: 'Резервные копии данных панели и конфигов CS2 с восстановлением', en: 'Create and manage backups of the panel data and CS2 configurations.' }, icon: Archive },
  'general-settings': { label: { ru: 'Настройки', en: 'Settings' }, hint: { ru: 'Настройки панели, сервера CS2 и журнал действий', en: 'Configure your panel settings and security preferences' }, icon: Settings },
};

export const ROLE_TEXT: Record<Role, Text> = {
  judge: { ru: 'Судья', en: 'Referee' },
  broadcast: { ru: 'Трансляция', en: 'Broadcast' },
};

// Sections that work with one chosen server (the server is picked in their page header)
export const SERVER_SECTIONS: Section[] = ['dashboard', 'live', 'console', 'chat', 'maps', 'players', 'match', 'settings'];

const NAV: Section[] = ['dashboard', 'servers', 'live', 'console', 'chat', 'maps', 'players', 'match', 'teams'];
// The panel's own pages, in the Quatrix order
const PANEL_NAV: Section[] = ['users', 'backups', 'general-settings'];

interface SidebarProps {
  activeSection: Section;
  onSelectSection: (section: Section) => void;
  onClose: () => void;
  user: { role: Role; name?: string };
}

export function Sidebar({ activeSection, onSelectSection, onClose, user }: SidebarProps) {
  const { t, lang } = useT();
  const role = ROLE_TEXT[user.role][lang];
  // Panel name from the settings, as in Quatrix; refreshed when the settings page saves
  const [panelName, setPanelName] = React.useState('');
  React.useEffect(() => {
    const load = () => { api<{ panelName: string }>('/api/panel-settings').then((s) => setPanelName(s.panelName)).catch(() => {}); };
    load();
    window.addEventListener('panel-settings-changed', load);
    return () => window.removeEventListener('panel-settings-changed', load);
  }, []);
  const displayName = user.name ?? role;
  const name = panelName || 'Matchdesk';
  return (
    <aside className="flex flex-col h-[100dvh] w-64 bg-sidebar text-gray-400 border-r border-gray-800 shrink-0">
      {/* Logo */}
      <div className="p-6 hidden md:flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center shadow-lg shadow-primary/30">
          <Crosshair size={22} className="text-white" />
        </div>
        <span className="text-lg font-bold text-white tracking-tight whitespace-nowrap truncate">{name}</span>
      </div>

      {/* Phone sidebar header */}
      <div className="p-6 md:hidden flex items-center justify-between border-b border-gray-800/50 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center">
            <Crosshair size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight truncate">{name}</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label={t('Закрыть меню', 'Close menu')}>
          <X size={20} />
        </button>
      </div>

      {/* Sections */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto" aria-label={t('Разделы', 'Main navigation')}>
        {NAV.map((id) => (
          <NavItem key={id} section={id} active={activeSection === id || (id === 'servers' && activeSection === 'settings')} onClick={() => onSelectSection(id)} />
        ))}
        <div className="pt-4 pb-1 px-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">{t('Панель', 'Panel')}</div>
        {PANEL_NAV.map((id) => (
          <NavItem key={id} section={id} active={activeSection === id} onClick={() => onSelectSection(id)} />
        ))}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-primary shrink-0 overflow-hidden">
              {getInitials(displayName)}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-white truncate">{displayName}</p>
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-green-500 truncate font-bold flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  {t('В сети', 'Online')}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}
            className="text-gray-500 hover:text-red-400 transition-colors p-1.5 hover:bg-red-400/10 rounded-lg"
            title={t('Выйти', 'Logout')}
            aria-label={t('Выйти', 'Logout')}
          >
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// Initials as in Quatrix: first letters of up to two words
function getInitials(name: string) {
  if (!name) return 'U';
  return name.split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().substring(0, 2);
}

function NavItem({ section, active, onClick }: { section: Section; active: boolean; onClick: () => void }) {
  const { lang } = useT();
  const { label, icon: Icon } = SECTIONS[section];
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left transition-all',
        active ? 'bg-primary text-white shadow-lg shadow-blue-500/20' : 'hover:bg-white/5 hover:text-white',
      )}
    >
      <Icon size={20} aria-hidden="true" />
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
