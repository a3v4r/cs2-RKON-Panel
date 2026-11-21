"use client";

import React from 'react';
import { Activity, Users, Map as MapIcon, Wifi, Plus, Trash2, Play, Pause, RotateCcw, Radio, Cpu, MemoryStick, Terminal, Trophy, ClipboardList, ChevronRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db_helper } from '@/lib/db';
import { api } from '@/lib/api';
import { auditWho, useT } from '@/lib/i18n';
import type { Section } from '@/components/layout/sidebar';

export interface ServerSample {
  t: number;
  ping: number;
  players: number;
}

interface SystemInfo {
  cpuModel: string;
  cores: number;
  memTotalGb: number;
  memUsedGb: number;
  samples: { t: number; cpu: number; mem: number }[];
}

interface AuditEntry {
  time: string;
  who: string;
  action: string;
}

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
  history: ServerSample[];
  onSendCommand: (command: string) => Promise<string>;
  onNavigate: (section: Section) => void;
  onAddServer: () => void;
  // Custom quick commands can be added/removed by admins only
  canManage: boolean;
}

export function ServerDashboard({ serverInfo, history, onSendCommand, onNavigate, onAddServer, canManage }: ServerDashboardProps) {
  const { t, locale, lang } = useT();
  const [system, setSystem] = React.useState<SystemInfo | null>(null);
  const [audit, setAudit] = React.useState<AuditEntry[] | null>(null);

  // Panel PC load and the latest judge actions refresh while the overview is open
  React.useEffect(() => {
    if (!canManage) return;
    const load = () => {
      api<SystemInfo>('/api/system').then(setSystem).catch(() => {});
      api<AuditEntry[]>('/api/audit').then((e) => setAudit(e.slice(0, 6))).catch(() => {});
    };
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [canManage]);

  const lastSystem = system?.samples[system.samples.length - 1];
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
    <div className="p-3 md:p-6 flex flex-col gap-4 md:gap-6 animate-in fade-in duration-500">
      {/* Stats Grid */}
      <div className="order-1 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title={t('Статус', 'Status')}
          value={serverInfo.status === 'online' ? t('Онлайн', 'Online') : serverInfo.status === 'offline' ? t('Нет связи', 'No connection') : '...'}
          icon={<Radio size={18} />}
          tone={serverInfo.status === 'online' ? 'emerald' : 'red'}
          description={serverInfo.name}
        />
        <StatCard title={t('Карта', 'Map')} value={serverInfo.map} icon={<MapIcon size={18} />} tone="blue" description={t('Текущая карта сервера', 'Current server map')} />
        <StatCard
          title={t('Игроки', 'Players')}
          value={`${serverInfo.players.online} / ${serverInfo.players.max}`}
          icon={<Users size={18} />}
          tone="violet"
          description={t(`ботов: ${serverInfo.players.bots}`, `bots: ${serverInfo.players.bots}`)}
        />
        <StatCard title={t('Пинг', 'Ping')} value={t(`${serverInfo.ping} мс`, `${serverInfo.ping} ms`)} icon={<Wifi size={18} />} tone="orange" description={t('Задержка до сервера', 'Latency to the server')} />
      </div>

      {/* Charts */}
      <div className="order-3 md:order-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <ChartCard
          title={t('Пинг', 'Ping')}
          subtitle={t('до игрового сервера', 'to the game server')}
          value={`${history.length ? history[history.length - 1].ping : 0} ${t('мс', 'ms')}`}
          icon={<Wifi size={18} />}
          color="#34d399"
          tone="emerald"
          points={history.map((s) => s.ping)}
        />
        <ChartCard
          title={t('Игроки', 'Players')}
          subtitle={t(`мест на сервере: ${serverInfo.players.max}`, `server slots: ${serverInfo.players.max}`)}
          value={`${history.length ? history[history.length - 1].players : 0} / ${serverInfo.players.max}`}
          icon={<Users size={18} />}
          color="#a78bfa"
          tone="violet"
          points={history.map((s) => s.players)}
          max={serverInfo.players.max || undefined}
        />
        <ChartCard
          title="CPU"
          subtitle={system ? `${t('ПК панели', 'Panel PC')} · ${system.cpuModel}` : t('ПК панели', 'Panel PC')}
          value={`${(lastSystem?.cpu ?? 0).toFixed(1)}%`}
          icon={<Cpu size={18} />}
          color="#1890ff"
          tone="blue"
          points={system?.samples.map((s) => s.cpu) ?? []}
          max={100}
        />
        <ChartCard
          title="RAM"
          subtitle={system ? `${t('ПК панели', 'Panel PC')} · ${system.memUsedGb} / ${system.memTotalGb} ${t('ГБ', 'GB')}` : t('ПК панели', 'Panel PC')}
          value={`${(lastSystem?.mem ?? 0).toFixed(1)}%`}
          icon={<MemoryStick size={18} />}
          color="#f97316"
          tone="orange"
          points={system?.samples.map((s) => s.mem) ?? []}
          max={100}
        />
      </div>

      {/* Quick Actions */}
        <div className="order-2 md:order-3 p-4 md:p-6 rounded-2xl border border-border bg-card shadow-lg shadow-black/20 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center">
              <Activity size={16} className="mr-2 text-primary" />
              {t('Быстрые действия', 'Quick actions')}
            </h3>
            {canManage && <button
              onClick={() => setIsAddingCmd(!isAddingCmd)}
              className="text-[10px] uppercase font-bold text-primary hover:text-primary/80 flex items-center bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg"
            >
              <Plus size={12} className="mr-1" /> {t('Своя', 'Custom')}
            </button>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 flex-1">
            <ActionButton label={t('Старт матча', 'Start match')} icon={<Play size={16} />} tone="emerald" onClick={() => onSendCommand('css_start')} />
            <ActionButton label={t('Рестарт матча', 'Restart match')} icon={<RotateCcw size={16} />} tone="slate" onClick={() => onSendCommand('mp_restartgame 1')} />
            <ActionButton label={t('Пауза', 'Pause')} icon={<Pause size={16} />} tone="amber" onClick={() => onSendCommand('css_forcepause')} />
            <ActionButton label={t('Снять паузу', 'Unpause')} icon={<Play size={16} />} tone="blue" onClick={() => onSendCommand('css_forceunpause')} />

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
                placeholder={t('Название (например, Нож)', 'Name (e.g. Knife)')}
                value={newCmdLabel}
                onChange={e => setNewCmdLabel(e.target.value)}
                className="w-full bg-background/50 border border-input rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <input
                placeholder={t('Команда (например, mp_warmup_start)', 'Command (e.g. mp_warmup_start)')}
                value={newCmdValue}
                onChange={e => setNewCmdValue(e.target.value)}
                className="w-full bg-background/50 border border-input rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <div className="flex space-x-2">
                <button
                  onClick={handleAddCommand}
                  className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-lg text-[11px] font-bold"
                >
                  {t('Сохранить', 'Save')}
                </button>
                <button
                  onClick={() => setIsAddingCmd(false)}
                  className="px-3 bg-white/5 py-1.5 rounded-lg text-[11px] font-bold"
                >
                  {t('Отмена', 'Cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

      {/* Shortcuts */}
      <div className="order-4">
        <div className="px-1 pb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t('Быстрый переход', 'Shortcuts')}</div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          <ShortcutTile icon={<Terminal size={18} />} label={t('Консоль', 'Console')} onClick={() => onNavigate('console')} />
          <ShortcutTile icon={<Trophy size={18} />} label={t('Запуск матча', 'Match setup')} onClick={() => onNavigate('match')} />
          <ShortcutTile icon={<MapIcon size={18} />} label={t('Карты', 'Maps')} onClick={() => onNavigate('maps')} />
          <ShortcutTile icon={<Layers size={18} />} label={t('Серверы', 'Servers')} onClick={onAddServer} />
        </div>
      </div>

      {/* Latest judge actions */}
      {canManage && (
        <div className="order-5 rounded-2xl border border-border bg-card shadow-lg shadow-black/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 md:px-6 pt-4 md:pt-5 pb-3">
            <ClipboardList size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-white">{t('Последние действия', 'Recent actions')}</h3>
          </div>
          {audit && audit.length > 0 ? (
            <div className="px-4 md:px-6 pb-3 space-y-1">
              {audit.map((e, i) => (
                <div key={i} className="flex items-baseline gap-3 py-1.5 border-b border-border/40 last:border-0 text-sm min-w-0">
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{new Date(e.time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-[11px] font-semibold text-primary shrink-0">{auditWho(e.who, lang)}</span>
                  <span className="text-white/90 truncate">{e.action}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center"><ClipboardList size={22} /></div>
              <span className="text-sm">{audit ? t('Действий пока не было', 'No actions yet') : t('Загрузка...', 'Loading...')}</span>
            </div>
          )}
          <button
            onClick={() => onNavigate('general-settings')}
            className="w-full flex items-center justify-between px-4 md:px-6 py-2.5 border-t border-border/60 text-[11px] font-bold text-muted-foreground hover:text-white hover:bg-white/[0.02] transition-colors"
          >
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />{t('Весь журнал', 'Full log')}</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// Card with a filled line chart, as on the Quatrix overview
function ChartCard({ title, subtitle, value, icon, color, tone, points, max }: {
  title: string; subtitle: string; value: string; icon: React.ReactNode; color: string; tone: keyof typeof TONES; points: number[]; max?: number;
}) {
  const { t } = useT();
  const id = React.useId().replace(/:/g, '');
  const W = 300, H = 100;
  const top = max ?? Math.max(1, ...points) * 1.25;
  const xy = points.map((v, i) => [
    points.length === 1 ? W : (i / (points.length - 1)) * W,
    H - Math.min(1, Math.max(0, v / top)) * (H - 4) - 2,
  ]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <div className="p-4 md:p-5 rounded-2xl border border-border bg-card shadow-lg shadow-black/20 min-w-0 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('p-2 rounded-lg border shrink-0', TONES[tone])}>{icon}</div>
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-white truncate">{title}</div>
            <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
          </div>
        </div>
        <div className="text-xl md:text-2xl font-semibold tabular-nums shrink-0" style={{ color }}>{value}</div>
      </div>
      <div className="mt-4 h-24 md:h-28">
        {points.length > 1 ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#fill-${id})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        ) : (
          <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">{t('График появится через несколько секунд', 'The chart will appear in a few seconds')}</div>
        )}
      </div>
    </div>
  );
}

function ShortcutTile({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 p-3 md:p-4 rounded-2xl border border-border bg-card shadow-lg shadow-black/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-left min-w-0"
    >
      <span className="w-9 h-9 shrink-0 rounded-lg bg-white/5 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-wider text-white truncate">{label}</span>
    </button>
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
