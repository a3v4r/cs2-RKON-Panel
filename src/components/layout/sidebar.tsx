"use client";

import React from 'react';
import {
  Plus,
  Settings,
  Terminal,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquare,
  Activity,
  Trophy,
  Server,
  Edit,
  Trash2,
  LogOut,
  ChevronDown,
  Crosshair,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, Role } from '@/lib/api';
import type { ServerProfile } from '@/lib/db';

export type Section = 'dashboard' | 'live' | 'console' | 'chat' | 'maps' | 'match' | 'settings' | 'general-settings';

export const SECTIONS: Record<Section, { label: string; hint: string; icon: LucideIcon }> = {
  dashboard: { label: 'Обзор', hint: 'Состояние сервера и быстрые действия', icon: LayoutDashboard },
  live: { label: 'Матч', hint: 'Счёт, раунды, статистика и откат раунда', icon: Activity },
  console: { label: 'Консоль', hint: 'RCON-команды на сервер', icon: Terminal },
  chat: { label: 'Чат', hint: 'Сообщения в игровой чат и автосообщения', icon: MessageSquare },
  maps: { label: 'Карты', hint: 'Смена карты', icon: MapIcon },
  match: { label: 'Запуск матча', hint: 'Конфиг MatchZy и запуск', icon: Trophy },
  settings: { label: 'Настройки сервера', hint: 'Подключение и параметры сервера', icon: SlidersHorizontal },
  'general-settings': { label: 'Настройки панели', hint: 'Журнал действий и версия панели', icon: Settings },
};

const SERVER_SECTIONS: Section[] = ['dashboard', 'live', 'console', 'chat', 'maps', 'match', 'settings'];

interface SidebarProps {
  servers: ServerProfile[];
  activeServerId: number | null;
  serverOnline: boolean | null;
  activeSection: Section;
  onSelectSection: (section: Section) => void;
  onSelectServer: (id: number) => void;
  onAddServer: () => void;
  onEditServer: (server: ServerProfile) => void;
  onDeleteServer: (id: number) => void;
  onClose: () => void;
  canManage: boolean;
  user: { role: Role };
}

export function Sidebar({
  servers,
  activeServerId,
  serverOnline,
  activeSection,
  onSelectSection,
  onSelectServer,
  onAddServer,
  onEditServer,
  onDeleteServer,
  onClose,
  canManage,
  user,
}: SidebarProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const active = servers.find((s) => s.id === activeServerId);

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

      {/* Server picker */}
      <div className="px-4 pb-3">
        <div className="px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Сервер</div>
        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          className="flex items-center gap-3 w-full p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors text-left"
          aria-expanded={pickerOpen}
        >
          <ServerBadge server={active} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{active?.name ?? (servers.length ? 'Выберите сервер' : 'Серверов нет')}</div>
            {active && (
              <div className="flex items-center gap-1.5 text-[11px] truncate">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', serverOnline === null ? 'bg-muted-foreground' : serverOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')} />
                <span className="truncate">{active.host}:{active.port}</span>
              </div>
            )}
          </div>
          <ChevronDown size={16} className={cn('shrink-0 transition-transform', pickerOpen && 'rotate-180')} />
        </button>

        {pickerOpen && (
          <div className="mt-2 p-1.5 rounded-xl bg-black/20 border border-white/5 space-y-0.5 max-h-64 overflow-y-auto">
            {servers.map((server) => (
              <div
                key={server.id}
                role="button"
                tabIndex={0}
                onClick={() => { onSelectServer(server.id!); setPickerOpen(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { onSelectServer(server.id!); setPickerOpen(false); } }}
                className={cn(
                  'group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors',
                  server.id === activeServerId ? 'bg-primary/15 text-white' : 'hover:bg-white/5 hover:text-white',
                )}
              >
                <ServerBadge server={server} small />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{server.name}</div>
                  <div className="text-[10px] opacity-60 truncate">{server.host}:{server.port}</div>
                </div>
                {canManage && (
                  <div className="flex md:hidden md:group-hover:flex items-center">
                    <button
                      className="p-2 md:p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-white/10"
                      onClick={(e) => { e.stopPropagation(); setPickerOpen(false); onEditServer(server); }}
                      aria-label={`Изменить ${server.name}`}
                    >
                      <Edit size={13} />
                    </button>
                    <button
                      className="p-2 md:p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
                      onClick={(e) => { e.stopPropagation(); onDeleteServer(server.id!); }}
                      aria-label={`Удалить ${server.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {canManage && (
              <button
                onClick={() => { setPickerOpen(false); onAddServer(); }}
                className="flex items-center gap-3 w-full p-2 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors"
              >
                <span className="w-7 h-7 rounded-lg border border-dashed border-primary/40 flex items-center justify-center"><Plus size={14} /></span>
                Добавить сервер
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sections */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto" aria-label="Разделы">
        {active && SERVER_SECTIONS.map((id) => (
          <NavItem key={id} section={id} active={activeSection === id} onClick={() => onSelectSection(id)} />
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

function ServerBadge({ server, small }: { server?: ServerProfile; small?: boolean }) {
  return (
    <span className={cn('shrink-0 rounded-lg bg-white/5 flex items-center justify-center', small ? 'w-7 h-7' : 'w-9 h-9')}>
      {server?.country_code ? (
        <span className={small ? 'text-base leading-none' : 'text-lg leading-none'}>{getFlagEmoji(server.country_code)}</span>
      ) : (
        <Server size={small ? 14 : 16} />
      )}
    </span>
  );
}

function getFlagEmoji(countryCode: string) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
