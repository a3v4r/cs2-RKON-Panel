"use client";

import React from 'react';
import { Activity, Users, Map as MapIcon, Wifi, Plus, Trash2, Play, Pause, RotateCcw, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db_helper } from '@/lib/db';

interface ServerDashboardProps {
  serverInfo: {
    name: string;
    map: string;
    players: {
      online: number;
      max: number;
      bots: number;
    };
    ping: number;
    keywords: string;
    status: 'online' | 'offline' | 'loading';
  };
  onSendCommand: (command: string) => Promise<string>;
  // Custom quick commands can be added/removed by admins only
  canManage: boolean;
}

const COMMON_MAPS = [
  'de_dust2',
  'de_mirage',
  'de_inferno',
  'de_nuke',
  'de_ancient',
  'de_anubis',
  'de_vertigo',
  'de_train',
  'de_overpass',
  'de_cache',
];

export function ServerDashboard({ serverInfo, onSendCommand, canManage }: ServerDashboardProps) {
  const [mapInput, setMapInput] = React.useState('');
  const [customCommands, setCustomCommands] = React.useState<any[]>([]);
  const [newCmdLabel, setNewCmdLabel] = React.useState('');
  const [newCmdValue, setNewCmdValue] = React.useState('');
  const [isAddingCmd, setIsAddingCmd] = React.useState(false);

  const loadCommands = async () => {
    try {
      const cmds = await db_helper.getCommands();
      setCustomCommands(cmds);
    } catch (e) {
      console.error("Failed to load commands:", e);
    }
  };

  React.useEffect(() => {
    loadCommands();
  }, []);

  const handleAddCommand = async () => {
    if (!newCmdLabel || !newCmdValue) return;
    try {
      await db_helper.addCommand(newCmdLabel, newCmdValue);
      setNewCmdLabel('');
      setNewCmdValue('');
      setIsAddingCmd(false);
      loadCommands();
    } catch (e) {
      console.error("Failed to add command:", e);
    }
  };

  const handleDeleteCommand = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await db_helper.deleteCommand(id);
      loadCommands();
    } catch (e) {
      console.error("Failed to delete command:", e);
    }
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in duration-500">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Статус"
          value={serverInfo.status === 'online' ? 'Онлайн' : serverInfo.status === 'offline' ? 'Нет связи' : '…'}
          icon={<Radio size={18} />}
          tone={serverInfo.status === 'online' ? 'emerald' : 'red'}
          description={serverInfo.name}
        />
        <StatCard title="Карта" value={serverInfo.map} icon={<MapIcon size={18} />} tone="blue" description="Текущая карта сервера" />
        <StatCard
          title="Игроки"
          value={`${serverInfo.players.online}/${serverInfo.players.max}`}
          icon={<Users size={18} />}
          tone="violet"
          description={`ботов: ${serverInfo.players.bots}`}
        />
        <StatCard title="Пинг" value={`${serverInfo.ping} мс`} icon={<Wifi size={18} />} tone="orange" description="Задержка до сервера" />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-4 md:p-6 rounded-2xl border border-border bg-card shadow-lg shadow-black/20 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center">
              <Activity size={16} className="mr-2 text-primary" />
              Быстрые действия
            </h3>
            {canManage && <button
              onClick={() => setIsAddingCmd(!isAddingCmd)}
              className="text-[10px] uppercase font-bold text-primary hover:text-primary/80 flex items-center bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg"
            >
              <Plus size={12} className="mr-1" /> Своя
            </button>}
          </div>

          <div className="grid grid-cols-2 gap-2 flex-1">
            <ActionButton label="Старт матча" icon={<Play size={16} />} tone="emerald" onClick={() => onSendCommand('css_start')} />
            <ActionButton label="Рестарт матча" icon={<RotateCcw size={16} />} tone="slate" onClick={() => onSendCommand('mp_restartgame 1')} />
            <ActionButton label="Пауза" icon={<Pause size={16} />} tone="amber" onClick={() => onSendCommand('css_forcepause')} />
            <ActionButton label="Снять паузу" icon={<Play size={16} />} tone="blue" onClick={() => onSendCommand('css_forceunpause')} />

            {customCommands.map(cmd => (
              <div key={cmd.id} className="relative group/btn">
                <ActionButton
                  label={cmd.label}
                  onClick={() => onSendCommand(cmd.command)}
                />
                {canManage && <button
                  onClick={(e) => handleDeleteCommand(e, cmd.id)}
                  className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full md:opacity-0 md:group-hover/btn:opacity-100 transition-opacity"
                >
                  <Trash2 size={10} />
                </button>}
              </div>
            ))}
          </div>

          {isAddingCmd && (
            <div className="mt-4 p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2 animate-in slide-in-from-top-2">
              <input
                placeholder="Название (например, Нож)"
                value={newCmdLabel}
                onChange={e => setNewCmdLabel(e.target.value)}
                className="w-full bg-background/50 border border-input rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <input
                placeholder="Команда (например, mp_warmup_start)"
                value={newCmdValue}
                onChange={e => setNewCmdValue(e.target.value)}
                className="w-full bg-background/50 border border-input rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <div className="flex space-x-2">
                <button
                  onClick={handleAddCommand}
                  className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-lg text-[11px] font-bold"
                >
                  Сохранить
                </button>
                <button
                  onClick={() => setIsAddingCmd(false)}
                  className="px-3 bg-white/5 py-1.5 rounded-lg text-[11px] font-bold"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 md:p-6 rounded-2xl border border-border bg-card shadow-lg shadow-black/20">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center">
            <MapIcon size={16} className="mr-2 text-primary" />
            Смена карты
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Карта (например, de_dust2)..."
              value={mapInput}
              onChange={(e) => setMapInput(e.target.value)}
              list="map-suggestions"
              className="flex-1 min-w-0 bg-background/50 border border-input rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
            <datalist id="map-suggestions">
              {COMMON_MAPS.map(map => (
                <option key={map} value={map} />
              ))}
            </datalist>
            <button
              onClick={() => { if(mapInput) onSendCommand(`map ${mapInput}`); }}
              className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
              disabled={!mapInput}
            >
              Сменить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TONES = {
  blue: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  red: 'text-red-400 bg-red-500/10 border-red-500/20',
  violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
} as const;

function StatCard({ title, value, icon, description, tone }: { title: string, value: string, icon: React.ReactNode, description: string, tone: keyof typeof TONES }) {
  return (
    <div className="p-4 md:p-5 rounded-2xl border border-border bg-card shadow-lg shadow-black/20 min-w-0">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate pt-1">{title}</span>
        <div className={cn('p-2 rounded-lg border shrink-0', TONES[tone])}>{icon}</div>
      </div>
      <div className="text-lg md:text-2xl font-black text-white tracking-tight truncate">{value}</div>
      <p className="text-[11px] md:text-xs text-muted-foreground mt-1 truncate">{description}</p>
    </div>
  );
}

const ACTION_TONES = {
  emerald: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30 border-transparent',
  amber: 'bg-amber-500 hover:bg-amber-400 !text-black shadow-amber-900/30 border-transparent',
  blue: 'bg-primary hover:bg-primary/90 shadow-primary/20 border-transparent',
  slate: 'bg-white/5 hover:bg-white/10 border-border',
} as const;

function ActionButton({ label, onClick, icon, tone = 'slate' }: { label: string, onClick?: () => void, icon?: React.ReactNode, tone?: keyof typeof ACTION_TONES }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full min-h-12 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-semibold text-white text-center shadow-lg active:scale-[0.98] transition-all',
        ACTION_TONES[tone],
      )}
    >
      {icon}
      {label}
    </button>
  );
}
