"use client";

import React from 'react';
import { Activity, Users, Map as MapIcon, Wifi, Plus, Trash2, Play, Pause, RotateCcw, Radio, Cpu, MemoryStick, Terminal, Trophy, ClipboardList, ChevronRight, Layers, Bell, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db_helper } from '@/lib/db';
import { api } from '@/lib/api';
import { auditWho, useT } from '@/lib/i18n';
import type { Section } from '@/components/layout/sidebar';
import { TeamNamesCard } from '@/components/teams/team-names-card';

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
    <div className="w-full p-3 md:p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Stats Summary Cards, as on the Quatrix dashboard */}
      <div className="order-1 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title={t('Статус', 'Status')}
          value={serverInfo.status === 'online' ? t('Онлайн', 'Online') : serverInfo.status === 'offline' ? t('Нет связи', 'No connection') : '...'}
          icon={<Radio size={18} />}
          color={serverInfo.status === 'online' ? 'text-green-500' : 'text-red-500'}
          description={serverInfo.name}
        />
        <StatCard title={t('Карта', 'Map')} value={serverInfo.map} icon={<MapIcon size={18} />} color="text-orange-500" description={t('Текущая карта сервера', 'Current server map')} />
        <StatCard
          title={t('Игроки', 'Players')}
          value={`${serverInfo.players.online} / ${serverInfo.players.max}`}
          icon={<Users size={18} />}
          color="text-purple-500"
          description={t(`ботов: ${serverInfo.players.bots}`, `bots: ${serverInfo.players.bots}`)}
        />
        <StatCard title={t('Пинг', 'Ping')} value={t(`${serverInfo.ping} мс`, `${serverInfo.ping} ms`)} icon={<Wifi size={18} />} color="text-blue-500" description={t('Задержка до сервера', 'Latency to the server')} />
      </div>

      {/* Real-time monitoring cards, as the Quatrix CPU / RAM / Network / Disk cards */}
      <div className="order-3 md:order-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        <ChartCard
          title={t('Пинг', 'Ping')}
          subtitle={t('до игрового сервера', 'to the game server')}
          value={`${history.length ? history[history.length - 1].ping : 0} ${t('мс', 'ms')}`}
          unit={t('мс', 'ms')}
          icon={<Wifi size={20} />}
          tone="emerald"
          data={history.map((s) => ({ t: s.t, v: s.ping }))}
        />
        <ChartCard
          title={t('Игроки', 'Players')}
          subtitle={t(`мест на сервере: ${serverInfo.players.max}`, `server slots: ${serverInfo.players.max}`)}
          value={`${history.length ? history[history.length - 1].players : 0} / ${serverInfo.players.max}`}
          unit=""
          icon={<Users size={20} />}
          tone="purple"
          data={history.map((s) => ({ t: s.t, v: s.players }))}
          max={serverInfo.players.max || undefined}
        />
        <ChartCard
          title={t('Загрузка CPU', 'CPU Usage')}
          subtitle={system ? `${t('ПК панели', 'Panel PC')} · ${system.cpuModel}` : t('ПК панели', 'Panel PC')}
          value={`${(lastSystem?.cpu ?? 0).toFixed(1)}%`}
          unit="%"
          icon={<Cpu size={20} />}
          tone="blue"
          data={system?.samples.map((s) => ({ t: s.t, v: s.cpu })) ?? []}
          max={100}
        />
        <ChartCard
          title={t('Загрузка RAM', 'RAM Usage')}
          subtitle={system ? `${t('ПК панели', 'Panel PC')} · ${system.memUsedGb} / ${system.memTotalGb} ${t('ГБ', 'GB')}` : t('ПК панели', 'Panel PC')}
          value={`${(lastSystem?.mem ?? 0).toFixed(1)}%`}
          unit="%"
          icon={<MemoryStick size={20} />}
          tone="orange"
          data={system?.samples.map((s) => ({ t: s.t, v: s.mem })) ?? []}
          max={100}
        />
      </div>

      {/* Quick Actions: our match controls in a Quatrix card container */}
      <div className="order-2 md:order-3 p-4 sm:p-6 bg-card rounded-2xl border border-gray-800/60 shadow-lg shadow-black/20 flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
              <Activity size={20} />
            </div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider truncate">
              {t('Быстрые действия', 'Quick actions')}
            </h3>
          </div>
          {canManage && <button
            onClick={() => setIsAddingCmd(!isAddingCmd)}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95"
          >
            <Plus size={12} /> {t('Своя', 'Custom')}
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
              className="w-full bg-background/50 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
            <input
              placeholder={t('Команда (например, mp_warmup_start)', 'Command (e.g. mp_warmup_start)')}
              value={newCmdValue}
              onChange={e => setNewCmdValue(e.target.value)}
              className="w-full bg-background/50 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
            <div className="flex space-x-2">
              <button
                onClick={handleAddCommand}
                className="flex-1 bg-primary hover:bg-primary/90 text-white py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
              >
                {t('Сохранить', 'Save')}
              </button>
              <button
                onClick={() => setIsAddingCmd(false)}
                className="px-4 bg-gray-800 hover:bg-gray-700 text-white py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
              >
                {t('Отмена', 'Cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Team names before the start, from the team library */}
      {canManage && (
        <div className="order-2 md:order-3">
          <TeamNamesCard onSendCommand={onSendCommand} onOpenLibrary={() => onNavigate('teams')} />
        </div>
      )}

      {/* Shortcuts, as the Quatrix Quick Actions bar */}
      <div className="order-4">
        <SectionLabel>{t('Быстрый переход', 'Shortcuts')}</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <ShortcutTile icon={<Terminal size={18} />} label={t('Открыть консоль', 'Open Console')} onClick={() => onNavigate('console')} />
          <ShortcutTile icon={<Trophy size={18} />} label={t('Запуск матча', 'Match setup')} onClick={() => onNavigate('match')} />
          <ShortcutTile icon={<MapIcon size={18} />} label={t('Карты', 'Maps')} onClick={() => onNavigate('maps')} />
          <ShortcutTile icon={<Layers size={18} />} label={t('Серверы', 'Servers')} onClick={onAddServer} />
        </div>
      </div>

      {/* Latest judge actions, as the Quatrix activity feed */}
      {canManage && (
        <div className="order-5">
          <SectionLabel>{t('Последние действия', 'Recent actions')}</SectionLabel>
          <div className="bg-card rounded-2xl border border-gray-800/60 overflow-hidden flex flex-col shadow-lg shadow-black/20 min-h-[220px]">
            <div className="flex-1 divide-y divide-gray-800/40 overflow-y-auto max-h-[220px]">
              {audit && audit.length > 0 ? (
                audit.map((e, i) => {
                  const Icon = e.who === 'трансляция' ? Radio : Bell;
                  return (
                    <div key={i} className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.01] transition-all group">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="p-1.5 rounded-lg text-blue-400 bg-blue-400/10 shrink-0">
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-200 truncate">{e.action}</div>
                          <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{auditWho(e.who, lang)}</div>
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity whitespace-nowrap tabular-nums">
                        <Clock size={10} />
                        {new Date(e.time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-6 py-12 text-center opacity-30 flex flex-col items-center justify-center h-full">
                  <div className="p-4 rounded-full bg-gray-800/50 mb-4">
                    <ClipboardList size={32} className="text-gray-600" />
                  </div>
                  <p className="text-sm font-medium">
                    {audit ? t('Действий судей пока не было.', 'No administrative activity recorded yet.') : t('Загрузка...', 'Loading...')}
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={() => onNavigate('general-settings')}
              className="w-full py-2.5 px-4 sm:px-6 text-[10px] font-bold text-gray-400 hover:text-white border-t border-gray-800/40 hover:bg-white/[0.02] transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {t('Весь журнал', 'View All Logs')}
              </div>
              <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Section heading above a block, as "QUICK ACTIONS" on the Quatrix dashboard
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 pl-1">{children}</h2>;
}

// Tailwind needs the full class names in the source, so every chart color is spelled out
const CHART_TONES = {
  blue: { hex: '#3b82f6', chip: 'bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20', value: 'text-blue-500', border: 'hover:border-blue-500/30', glow: 'bg-blue-500/5 group-hover:bg-blue-500/10' },
  purple: { hex: '#a855f7', chip: 'bg-purple-500/10 text-purple-500 group-hover:bg-purple-500/20', value: 'text-purple-500', border: 'hover:border-purple-500/30', glow: 'bg-purple-500/5 group-hover:bg-purple-500/10' },
  emerald: { hex: '#10b981', chip: 'bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20', value: 'text-emerald-500', border: 'hover:border-emerald-500/30', glow: 'bg-emerald-500/5 group-hover:bg-emerald-500/10' },
  orange: { hex: '#f97316', chip: 'bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20', value: 'text-orange-500', border: 'hover:border-orange-500/30', glow: 'bg-orange-500/5 group-hover:bg-orange-500/10' },
} as const;

// Smooth line through the points without overshoot (monotone cubic, the curve recharts draws for type="monotone")
function monotonePath(pts: number[][]) {
  const n = pts.length;
  if (n < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const h = pts.slice(1).map(([x], i) => x - pts[i][0]);
  const s = pts.slice(1).map(([, y], i) => (y - pts[i][1]) / (h[i] || 1));
  const tan = new Array<number>(n);
  for (let i = 1; i < n - 1; i++) {
    const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i] || 1);
    tan[i] = (Math.sign(s[i - 1]) + Math.sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(p)) || 0;
  }
  tan[0] = (3 * s[0] - tan[1]) / 2;
  tan[n - 1] = (3 * s[n - 2] - tan[n - 2]) / 2;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = h[i] / 3;
    d += ` C${(x0 + dx).toFixed(1)},${(y0 + tan[i] * dx).toFixed(1)} ${(x1 - dx).toFixed(1)},${(y1 - tan[i + 1] * dx).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

// Monitoring card with a filled area chart, as the Quatrix CPU / RAM / Network / Disk cards
function ChartCard({ title, subtitle, value, unit, icon, tone, data, max }: {
  title: string; subtitle: string; value: string; unit: string; icon: React.ReactNode; tone: keyof typeof CHART_TONES; data: { t: number; v: number }[]; max?: number;
}) {
  const { t, locale } = useT();
  const id = React.useId().replace(/:/g, '');
  const [hover, setHover] = React.useState<number | null>(null);
  const c = CHART_TONES[tone];
  const W = 300, H = 128;
  const points = data.map((d) => d.v);
  const top = max ?? Math.max(1, ...points) * 1.25;
  const xy = points.map((v, i) => [
    points.length === 1 ? W : (i / (points.length - 1)) * W,
    H - Math.min(1, Math.max(0, v / top)) * (H - 4) - 2,
  ]);
  const line = monotonePath(xy);
  const active = hover !== null && hover < data.length ? hover : null;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (data.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (data.length - 1)));
  };

  return (
    <div className={cn('p-4 sm:p-6 bg-card rounded-2xl border border-gray-800/60 shadow-lg shadow-black/20 overflow-hidden relative group transition-all min-w-0', c.border)}>
      <div className="relative z-10">
        <div className="flex justify-between items-start gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('p-2.5 rounded-xl transition-colors shrink-0', c.chip)}>{icon}</div>
            <div className="min-w-0">
              <h3 className="text-xs font-black text-white uppercase tracking-wider whitespace-nowrap">{title}</h3>
              <p className="text-[9px] text-gray-500 font-bold truncate">{subtitle}</p>
            </div>
          </div>
          <div className={cn('text-xl 2xl:text-2xl font-black tabular-nums shrink-0', c.value)}>{value}</div>
        </div>

        <div className="relative h-32 w-full mt-2" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {points.length > 1 ? (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                <defs>
                  <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c.hex} stopOpacity="0.3" />
                    <stop offset="95%" stopColor={c.hex} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {active !== null && (
                  <line x1={xy[active][0]} x2={xy[active][0]} y1={0} y2={H} stroke="#ccc" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                )}
                <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#fill-${id})`} />
                <path d={line} fill="none" stroke={c.hex} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </svg>
              {active !== null && (
                <>
                  <span
                    className="absolute w-2.5 h-2.5 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${(xy[active][0] / W) * 100}%`, top: `${(xy[active][1] / H) * 100}%`, backgroundColor: c.hex }}
                  />
                  <div
                    className={cn(
                      'absolute top-0 z-20 bg-gray-800 border border-gray-700 p-3 rounded-lg shadow-xl backdrop-blur-md min-w-[120px] pointer-events-none',
                      xy[active][0] > W / 2 ? '-translate-x-full -ml-3' : 'ml-3',
                    )}
                    style={{ left: `${(xy[active][0] / W) * 100}%` }}
                  >
                    <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase tracking-widest border-b border-gray-700 pb-1">
                      {new Date(data[active].t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                    <div className="flex items-center justify-between gap-4 mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
                        <span className="text-[10px] font-bold text-gray-300 uppercase truncate">{title}</span>
                      </div>
                      <span className="text-xs font-black text-white whitespace-nowrap">{data[active].v}{unit ? ` ${unit}` : ''}</span>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-500 font-bold">
              {t('График появится через несколько секунд', 'The chart will appear in a few seconds')}
            </div>
          )}
        </div>
      </div>
      <div className={cn('absolute -bottom-4 -right-4 w-24 h-24 blur-2xl rounded-full transition-all', c.glow)} />
    </div>
  );
}

// Navigation tile, as the Quatrix Quick Actions buttons
function ShortcutTile({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 sm:gap-4 p-4 bg-card rounded-2xl border border-gray-800/60 hover:border-primary/50 hover:bg-primary/5 transition-all group shadow-lg shadow-black/10 text-left min-w-0"
    >
      <div className="p-2.5 rounded-xl bg-gray-800/50 text-gray-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
        {icon}
      </div>
      <span className="text-[10px] font-black text-gray-400 group-hover:text-white uppercase tracking-wider truncate">{label}</span>
    </button>
  );
}

// Summary card, as the Quatrix Servers / Players / Uptime / Maps cards
function StatCard({ title, value, icon, description, color }: { title: string, value: string, icon: React.ReactNode, description: string, color: string }) {
  return (
    <div className="p-4 sm:p-6 bg-card rounded-2xl border border-gray-800/60 hover:border-white/10 transition-all hover:translate-y-[-2px] group shadow-lg shadow-black/20 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest truncate">{title}</span>
        <div className={cn('p-2 rounded-lg bg-white/5 group-hover:scale-110 transition-transform shrink-0', color)}>{icon}</div>
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-xl sm:text-3xl font-black text-white truncate">{value}</span>
      </div>
      <p className="text-xs text-gray-500 mt-2 font-medium opacity-80 truncate">{description}</p>
    </div>
  );
}

const ACTION_TONES = {
  emerald: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30 border-transparent',
  amber: 'bg-amber-500 hover:bg-amber-400 !text-black shadow-amber-900/30 border-transparent',
  blue: 'bg-primary hover:bg-primary/90 shadow-primary/20 border-transparent',
  slate: 'bg-white/5 hover:bg-white/10 border-gray-800',
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
