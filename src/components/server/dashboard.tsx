"use client";

import React from 'react';
import { Activity, Users, Map as MapIcon, Globe, Wifi, Clock, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db_helper } from '@/lib/db';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';

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
  const toast = useToast();
  const confirmDialog = useConfirm();

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

  // Every quick action answers with a toast: a silently failed pause mid-match is the worst outcome
  const runCommand = async (label: string, command: string) => {
    try {
      await onSendCommand(command);
      toast.success(`${label}: выполнено`);
    } catch (e) {
      toast.error(`${label}: ${(e as Error).message}`);
    }
  };

  const handleAddCommand = async () => {
    if (!newCmdLabel || !newCmdValue) return;
    try {
      await db_helper.addCommand(newCmdLabel, newCmdValue);
      setNewCmdLabel('');
      setNewCmdValue('');
      setIsAddingCmd(false);
      loadCommands();
      toast.success('Команда добавлена');
    } catch (e) {
      toast.error(`Не удалось добавить команду: ${(e as Error).message}`);
    }
  };

  const handleDeleteCommand = async (e: React.MouseEvent, cmd: any) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: 'Удалить команду?',
      description: `Кнопка «${cmd.label}» исчезнет из быстрых действий.`,
      confirmLabel: 'Удалить',
      destructive: true,
    });
    if (!ok) return;
    try {
      await db_helper.deleteCommand(cmd.id);
      loadCommands();
      toast.success('Команда удалена');
    } catch (err) {
      toast.error(`Не удалось удалить команду: ${(err as Error).message}`);
    }
  };

  // Changing the map reloads the server and kicks everyone: always confirmed
  const handleMapChange = async () => {
    const map = mapInput.trim();
    if (!map) return;
    const ok = await confirmDialog({
      title: 'Сменить карту?',
      description: `Сервер перезагрузится на карту ${map}, все игроки отключатся.`,
      confirmLabel: 'Сменить',
      destructive: true,
    });
    if (!ok) return;
    try {
      await onSendCommand(`map ${map}`);
      toast.success(`Карта меняется: ${map}`);
      setMapInput('');
    } catch (e) {
      toast.error(`Не удалось сменить карту: ${(e as Error).message}`);
    }
  };

  return (
    <div className="p-3 md:p-6 space-y-6 animate-in fade-in duration-500">
      {/* Hero Section / Status */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl md:text-3xl font-bold tracking-tight text-white">{serverInfo.name}</h2>
          <div className="flex items-center mt-1 text-muted-foreground">
            <Globe size={14} className="mr-1" />
            <span className="text-sm">{serverInfo.status === 'online' ? 'Подключено' : 'Нет связи'}</span>
          </div>
        </div>
        <div className={cn(
          "flex items-center space-x-2 px-3 py-1 rounded-full border",
          serverInfo.status === 'online' 
            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
            : "bg-red-500/10 text-red-500 border-red-500/20"
        )}>
          <div className={cn("w-2 h-2 rounded-full", serverInfo.status === 'online' ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
          <span className="text-xs font-bold uppercase tracking-wider">{serverInfo.status === 'online' ? 'онлайн' : serverInfo.status === 'offline' ? 'офлайн' : '...'}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard 
          title="Карта" 
          value={serverInfo.map} 
          icon={<MapIcon className="text-blue-500" size={20} />} 
          description="Текущая карта сервера"
        />
        <StatCard 
          title="Игроки" 
          value={`${serverInfo.players.online}/${serverInfo.players.max}`} 
          icon={<Users className="text-orange-500" size={20} />} 
          description={`ботов: ${serverInfo.players.bots}`}
        />
        <StatCard 
          title="Пинг" 
          value={`${serverInfo.ping}ms`} 
          icon={<Wifi className="text-emerald-500" size={20} />} 
          description="Задержка до сервера"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
         <div className="p-4 md:p-6 rounded-xl border border-border bg-[#09090b]/50 backdrop-blur-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center">
                <Activity size={18} className="mr-2 text-primary" />
                Быстрые действия
              </h3>
              {canManage && <button 
                onClick={() => setIsAddingCmd(!isAddingCmd)}
                className="text-[10px] uppercase font-bold text-primary hover:text-primary/80 flex items-center bg-primary/10 px-2 py-1 rounded"
              >
                <Plus size={12} className="mr-1" /> Своя
              </button>}
            </div>
            
            <div className="grid grid-cols-2 gap-2 flex-1">
              <ActionButton label="Старт матча" onClick={() => runCommand('Старт матча', 'css_start')} />
              <ActionButton label="Рестарт матча" onClick={() => runCommand('Рестарт матча', 'mp_restartgame 1')} />
              <ActionButton label="Пауза" onClick={() => runCommand('Пауза', 'css_forcepause')} />
              <ActionButton label="Снять паузу" onClick={() => runCommand('Снять паузу', 'css_forceunpause')} />
              
              {customCommands.map(cmd => (
                <div key={cmd.id} className="relative group/btn">
                  <ActionButton 
                    label={cmd.label} 
                    onClick={() => runCommand(cmd.label, cmd.command)} 
                  />
                  {canManage && <button 
                    onClick={(e) => handleDeleteCommand(e, cmd)}
                    className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full md:opacity-0 md:group-hover/btn:opacity-100 transition-opacity"
                  >
                    <Trash2 size={10} />
                  </button>}
                </div>
              ))}
            </div>

            {isAddingCmd && (
              <div className="mt-4 p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2 animate-in slide-in-from-top-2">
                <input 
                  placeholder="Название (например, Нож)" 
                  value={newCmdLabel}
                  onChange={e => setNewCmdLabel(e.target.value)}
                  className="w-full bg-black/40 border border-border rounded px-2 py-1 text-xs outline-none focus:border-primary"
                />
                <input 
                  placeholder="Команда (например, mp_warmup_start)" 
                  value={newCmdValue}
                  onChange={e => setNewCmdValue(e.target.value)}
                  className="w-full bg-black/40 border border-border rounded px-2 py-1 text-xs outline-none focus:border-primary"
                />
                <div className="flex space-x-2">
                  <button 
                    onClick={handleAddCommand}
                    className="flex-1 bg-primary text-primary-foreground py-1 rounded text-[10px] font-bold"
                  >
                    Сохранить
                  </button>
                  <button 
                    onClick={() => setIsAddingCmd(false)}
                    className="px-3 bg-white/5 py-1 rounded text-[10px] font-bold"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
         </div>
         
         <div className="p-4 md:p-6 rounded-xl border border-border bg-[#09090b]/50 backdrop-blur-sm">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <MapIcon size={18} className="mr-2 text-primary" />
              Смена карты
            </h3>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Карта (например, de_dust2)..."
                value={mapInput}
                onChange={(e) => setMapInput(e.target.value)}
                list="map-suggestions"
                className="flex-1 bg-white/5 border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
              />
              <datalist id="map-suggestions">
                {COMMON_MAPS.map(map => (
                  <option key={map} value={map} />
                ))}
              </datalist>
              <button 
                onClick={handleMapChange}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm hover:bg-primary/90 transition-colors"
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

function StatCard({ title, value, icon, description }: { title: string, value: string, icon: React.ReactNode, description: string }) {
  return (
    <div className="p-3 md:p-6 rounded-xl border border-border bg-[#09090b] hover:border-primary/50 transition-colors group min-w-0">
      <div className="flex items-center justify-between mb-1 md:mb-2">
        <span className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">{title}</span>
        <div className="hidden md:block p-2 rounded-lg bg-white/5 group-hover:bg-primary/10 transition-colors">
          {icon}
        </div>
      </div>
      <div className="text-base md:text-2xl font-bold text-white truncate">{value}</div>
      <p className="hidden md:block text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string, onClick?: () => void | Promise<void> }) {
  const [busy, setBusy] = React.useState(false);
  const handle = async () => {
    if (!onClick || busy) return;
    setBusy(true);
    try {
      await onClick();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button 
      onClick={handle}
      disabled={busy}
      className="w-full flex items-center justify-center p-3 rounded-md border border-border bg-white/5 hover:bg-white/10 hover:border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all text-sm font-medium text-white text-center disabled:opacity-50"
    >
      {label}
    </button>
  );
}
