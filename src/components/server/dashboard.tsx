"use client";

import React from 'react';
import { Activity, Users, Map as MapIcon, Globe, Wifi, Plus, Trash2, RotateCcw, RotateCw, Terminal, LineChart, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db_helper, ServerMode } from '@/lib/db';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { RoundRestore } from '@/components/server/round-restore';
import { VanillaRoundRestore } from '@/components/server/vanilla-restore';
import { PingChartDialog, type PingSample } from '@/components/server/ping-chart';
import { PlayersDialog } from '@/components/server/players';

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
  serverId: number;
  // The server mode only highlights the active card and picks the round-restore flavor;
  // both quick-action groups stay available, each with its own map command.
  mode: ServerMode;
  onSendCommand: (command: string) => Promise<string>;
  // Drops the panel's RCON connection and polls the server again (judge button)
  onReconnect: () => Promise<void>;
  // Custom quick commands can be added/removed by admins only
  canManage: boolean;
  // Ping samples polled by the page: click the ping card to see them on a chart
  pingHistory: PingSample[];
  pingAverage: number | null;
}

// Same pool as the old "Maps" tab
const MAPS = [
  { id: 'de_inferno', label: 'Inferno' },
  { id: 'de_mirage', label: 'Mirage' },
  { id: 'de_nuke', label: 'Nuke' },
  { id: 'de_cache', label: 'Cache' },
  { id: 'de_ancient', label: 'Ancient' },
  { id: 'de_anubis', label: 'Anubis' },
  { id: 'de_dust2', label: 'Dust 2' },
];

const MATCHZY_ACTIONS = [
  { label: 'Форс-старт', command: 'css_forcestart' },
  { label: 'Завершить матч', command: 'css_forceend', confirmEnd: true },
  { label: 'Пауза', command: 'css_forcepause' },
  { label: 'Снять паузу', command: 'css_forceunpause' },
  { label: 'Ножи: вкл/выкл', command: 'css_roundknife' },
];

const VANILLA_ACTIONS = [
  { label: 'ESL 5on5', command: 'exec esl5on5' },
  { label: 'ESL 3on3', command: 'exec esl3on3' },
  { label: 'Ножевой раунд', command: 'exec knife' },
  { label: 'После ножа: смена', command: 'mp_warmup_start; mp_swapteams 1' },
  { label: 'После ножа: без смены', command: 'mp_warmup_start' },
  { label: 'Пауза', command: 'mp_pause_match' },
  { label: 'Снять паузу', command: 'mp_unpause_match' },
];

export function ServerDashboard({ serverInfo, serverId, mode, onSendCommand, onReconnect, canManage, pingHistory, pingAverage }: ServerDashboardProps) {
  const [reconnecting, setReconnecting] = React.useState(false);
  const [pingChartOpen, setPingChartOpen] = React.useState(false);
  const [playersOpen, setPlayersOpen] = React.useState(false);
  const [customCommands, setCustomCommands] = React.useState<any[]>([]);
  const [newCmdLabel, setNewCmdLabel] = React.useState('');
  const [newCmdValue, setNewCmdValue] = React.useState('');
  const [isAddingCmd, setIsAddingCmd] = React.useState(false);
  const [team1, setTeam1] = React.useState('');
  const [team2, setTeam2] = React.useState('');
  const [vanillaTeam1, setVanillaTeam1] = React.useState('');
  const [vanillaTeam2, setVanillaTeam2] = React.useState('');
  const [teams, setTeams] = React.useState<string[]>([]);
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
    // Saved teams feed the dropdowns next to the name fields
    db_helper.getTeams().then(setTeams);
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

  // Reconnecting can fail too, and a silent spinner would look like nothing happened
  const handleReconnect = async () => {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      await onReconnect();
      toast.success('Соединение восстановлено');
    } catch (e) {
      toast.error(`Не удалось переподключиться: ${(e as Error).message}`);
    } finally {
      setReconnecting(false);
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

  // Ending a match cannot be undone from the panel, so it is always confirmed
  const handleEndMatch = async () => {
    const ok = await confirmDialog({
      title: 'Завершить матч?',
      description: 'MatchZy закончит текущий матч без победителя. Вернуться к нему можно только повторным запуском.',
      confirmLabel: 'Завершить',
      destructive: true,
    });
    if (ok) await runCommand('Завершение матча', 'css_forceend');
  };

  // MatchZy names (css_team1/css_team2) have no effect outside a loaded match and cannot be changed after
  // the start; vanilla names (mp_teamname_1/mp_teamname_2) work on a running server. A console reply to either
  // command is a refusal (a successful change prints nothing).
  const setTeamName = async (command: string, label: string, raw: string) => {
    const name = raw.trim();
    if (!name) return;
    try {
      const output = await onSendCommand(`${command} "${name.replace(/"/g, '')}"`);
      const reply = output.split('\n').map((line) => line.replace(/[\x00-\x1f]/g, '').trim()).filter(Boolean).join(' ');
      if (reply) toast.error(`${label}: ${reply}`);
      else toast.success(`${label}: задано`);
    } catch (e) {
      toast.error(`${label}: ${(e as Error).message}`);
    }
  };

  const customButtons = customCommands.map(cmd => (
    <div key={cmd.id} className="relative group/btn">
      <ActionButton
        label={cmd.label}
        onClick={() => runCommand(cmd.label, cmd.command)}
      />
      {canManage && <button
        onClick={(e) => handleDeleteCommand(e, cmd)}
        className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full md:opacity-0 md:group-hover/btn:opacity-100 transition-opacity"
      >
        <Trash2 size={9} />
      </button>}
    </div>
  ));

  return (
    <div className="p-3 md:p-4 space-y-3 animate-in fade-in duration-500">
      {/* Hero Section / Status */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg md:text-2xl font-bold tracking-tight text-white truncate">{serverInfo.name}</h2>
          <div className="flex items-center mt-0.5 text-muted-foreground">
            <Globe size={12} className="mr-1" />
            <span className="text-xs">{serverInfo.status === 'online' ? 'Подключено' : 'Нет связи'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={cn(
            "flex items-center space-x-1.5 px-2 py-0.5 rounded-full border",
            serverInfo.status === 'online' 
              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
              : "bg-red-500/10 text-red-500 border-red-500/20"
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full", serverInfo.status === 'online' ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{serverInfo.status === 'online' ? 'онлайн' : serverInfo.status === 'offline' ? 'офлайн' : '...'}</span>
          </div>
          <button
            onClick={handleReconnect}
            disabled={reconnecting}
            title="Переподключиться к серверу"
            className="flex items-center gap-1 rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
          >
            <RotateCw size={10} className={reconnecting ? 'animate-spin' : undefined} />
            <span className="hidden sm:inline">Реконнект</span>
          </button>
        </div>
      </div>

      {/* Stats: one compact strip */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          title="Карта"
          value={serverInfo.map}
          icon={<MapIcon className="text-blue-500" size={14} />}
          description="Текущая карта сервера"
        />
        <StatCard
          title="Игроки"
          value={`${serverInfo.players.online}/${serverInfo.players.max}`}
          icon={<Users className="text-orange-500" size={14} />}
          description={`ботов: ${serverInfo.players.bots} — нажмите для списка`}
          hint={<ChevronRight size={13} />}
          onClick={() => setPlayersOpen(true)}
        />
        <StatCard
          title="Пинг"
          value={serverInfo.status === 'online' ? `${serverInfo.ping}ms` : '—'}
          secondary={`ср. ${pingAverage !== null ? `${pingAverage}ms` : '—'}`}
          icon={<Wifi className="text-emerald-500" size={14} />}
          description="Задержка до сервера — нажмите для графика"
          hint={<LineChart size={13} />}
          onClick={() => setPingChartOpen(true)}
        />
      </div>

      <PingChartDialog
        open={pingChartOpen}
        onOpenChange={setPingChartOpen}
        samples={pingHistory}
        average={pingAverage}
        current={serverInfo.ping}
        serverName={serverInfo.name}
        online={serverInfo.status === 'online'}
      />

      <PlayersDialog
        open={playersOpen}
        onOpenChange={setPlayersOpen}
        serverId={serverId}
        serverName={serverInfo.name}
      />

      {/* Two separate quick-action groups: MatchZy map change uses css_map, Vanilla uses map */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className={cn('p-3 rounded-lg border bg-[#09090b]/50 backdrop-blur-sm', mode === 'matchzy' ? 'border-primary/40' : 'border-border')}>
          <div className="flex items-center mb-2">
            <h3 className="text-sm font-semibold flex items-center min-w-0">
              <Activity size={14} className="mr-1.5 text-primary shrink-0" />
              MatchZy
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {MATCHZY_ACTIONS.map((action) => (
              <ActionButton
                key={action.command}
                label={action.label}
                onClick={() => action.confirmEnd ? handleEndMatch() : runCommand(action.label, action.command)}
              />
            ))}
          </div>
          <MapChanger
            command="css_map"
            currentMap={serverInfo.map}
            onSendCommand={onSendCommand}
          />
          <div className="mt-2.5 pt-2.5 border-t border-border space-y-2">
            <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground">Названия команд (до старта)</p>
            <TeamNameField
              label="Команда 1"
              teams={teams}
              value={team1}
              onChange={setTeam1}
              onSubmit={() => setTeamName('css_team1', 'Название команды 1', team1)}
            />
            <TeamNameField
              label="Команда 2"
              teams={teams}
              value={team2}
              onChange={setTeam2}
              onSubmit={() => setTeamName('css_team2', 'Название команды 2', team2)}
            />
          </div>
        </section>

        <section className={cn('p-3 rounded-lg border bg-[#09090b]/50 backdrop-blur-sm', mode === 'vanilla' ? 'border-primary/40' : 'border-border')}>
          <div className="flex items-center mb-2">
            <h3 className="text-sm font-semibold flex items-center min-w-0">
              <Terminal size={14} className="mr-1.5 text-primary shrink-0" />
              Vanilla
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {VANILLA_ACTIONS.map((action) => (
              <ActionButton
                key={action.command}
                label={action.label}
                onClick={() => runCommand(action.label, action.command)}
              />
            ))}
          </div>
          <MapChanger
            command="map"
            currentMap={serverInfo.map}
            onSendCommand={onSendCommand}
          />
          <div className="mt-2.5 pt-2.5 border-t border-border space-y-2">
            <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground">Названия команд (mp_teamname)</p>
            <TeamNameField
              label="Команда 1"
              teams={teams}
              value={vanillaTeam1}
              onChange={setVanillaTeam1}
              onSubmit={() => setTeamName('mp_teamname_1', 'Название команды 1', vanillaTeam1)}
            />
            <TeamNameField
              label="Команда 2"
              teams={teams}
              value={vanillaTeam2}
              onChange={setVanillaTeam2}
              onSubmit={() => setTeamName('mp_teamname_2', 'Название команды 2', vanillaTeam2)}
            />
          </div>
        </section>

      </div>

      {/* Judge-added commands: available on both modes, kept apart from the built-in sets */}
      {(customCommands.length > 0 || canManage) && (
        <section className="p-3 rounded-lg border border-border bg-[#09090b]/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center min-w-0">
              <Plus size={14} className="mr-1.5 text-primary shrink-0" />
              Свои команды
            </h3>
            {canManage && (
              <button
                onClick={() => setIsAddingCmd(!isAddingCmd)}
                className="text-[9px] uppercase font-bold text-primary hover:text-primary/80 flex items-center bg-primary/10 px-1.5 py-0.5 rounded shrink-0"
              >
                <Plus size={10} className="mr-0.5" /> Своя
              </button>
            )}
          </div>

          {isAddingCmd && (
            <div className="mb-2 p-2 rounded-md border border-primary/20 bg-primary/5 space-y-1.5 animate-in slide-in-from-top-2">
              <input
                placeholder="Название (например, Нож)"
                value={newCmdLabel}
                onChange={e => setNewCmdLabel(e.target.value)}
                className="w-full bg-black/40 border border-border rounded px-2 py-1 text-[11px] outline-none focus:border-primary"
              />
              <input
                placeholder="Команда (например, mp_warmup_start)"
                value={newCmdValue}
                onChange={e => setNewCmdValue(e.target.value)}
                className="w-full bg-black/40 border border-border rounded px-2 py-1 text-[11px] outline-none focus:border-primary"
              />
              <div className="flex space-x-1.5">
                <button
                  onClick={handleAddCommand}
                  className="flex-1 bg-primary text-primary-foreground py-1 rounded text-[10px] font-bold"
                >
                  Сохранить
                </button>
                <button
                  onClick={() => setIsAddingCmd(false)}
                  className="px-2 bg-white/5 py-1 rounded text-[10px] font-bold"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {customCommands.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
              {customButtons}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Своих команд пока нет.</p>
          )}
        </section>
      )}

      {/* Round restore: MatchZy backups or the game's own vanilla backups */}
      {mode === 'matchzy'
        ? <RoundRestore serverId={serverId} />
        : <VanillaRoundRestore serverId={serverId} />}
    </div>
  );
}

function StatCard({ title, value, secondary, icon, description, hint, onClick }: {
  title: string;
  value: string;
  secondary?: string;
  icon: React.ReactNode;
  description: string;
  hint?: React.ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="hidden sm:flex shrink-0 p-1 rounded bg-white/5">{icon}</div>
      <div className="min-w-0">
        <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{title}</div>
        <div className="text-sm md:text-base font-bold text-white truncate leading-tight">{value}</div>
        {secondary && <div className="text-[10px] text-muted-foreground truncate leading-tight">{secondary}</div>}
      </div>
      {hint ? (
        <span className="ml-auto shrink-0 text-muted-foreground">{hint}</span>
      ) : (
        <span className="ml-auto hidden xl:block text-[10px] text-muted-foreground truncate">{description}</span>
      )}
    </>
  );

  const classes = cn(
    'flex items-center gap-2 min-w-0 px-2.5 py-2 rounded-lg border border-border bg-[#09090b] hover:border-primary/40 transition-colors',
    onClick && 'text-left cursor-pointer hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={description} className={classes}>
        {body}
      </button>
    );
  }
  return (
    <div title={description} className={classes}>
      {body}
    </div>
  );
}

function MapChanger({ command, currentMap, onSendCommand }: {
  command: 'css_map' | 'map';
  currentMap: string;
  onSendCommand: (command: string) => Promise<string>;
}) {
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const confirmDialog = useConfirm();
  const listId = React.useId().replace(/:/g, '');

  // Choosing a map tile only fills the field; the explicit button sends the command
  const change = async () => {
    const map = value.trim();
    if (!map || busy) return;
    setBusy(true);
    try {
      await onSendCommand(`${command} ${map}`);
      toast.success(`Карта меняется: ${map}`);
      setValue('');
    } catch (e) {
      toast.error(`Не удалось сменить карту: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const restart = async () => {
    if (busy) return;
    if (!currentMap || currentMap === '---') {
      toast.error('Карта ещё не известна — подождите, пока сервер ответит');
      return;
    }
    const ok = await confirmDialog({
      title: 'Перезапустить карту?',
      description: `Карта ${currentMap} перезапустится, все игроки отключатся.`,
      confirmLabel: 'Перезапустить',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onSendCommand(`${command} ${currentMap}`);
      toast.success(`Перезапуск карты: ${currentMap}`);
    } catch (e) {
      toast.error(`Не удалось перезапустить карту: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2.5 pt-2.5 border-t border-border space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground flex items-center">
          <MapIcon size={11} className="mr-1" /> Смена карты
        </p>
        <span className="text-[10px] text-muted-foreground truncate">сейчас: {currentMap}</span>
      </div>

      {/* Manual map first: the list below covers only the popular pool */}
      <input
        type="text"
        placeholder="Карта вручную (например, de_overpass)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        list={listId}
        className="w-full bg-white/5 border border-border rounded-md px-2 py-1.5 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
      />
      <datalist id={listId}>
        {MAPS.map(map => (
          <option key={map.id} value={map.id} />
        ))}
      </datalist>

      <div className="grid grid-cols-3 gap-1.5">
        {MAPS.map((map) => (
          <button
            key={map.id}
            onClick={() => setValue(map.id)}
            title={map.id}
            className={cn(
              'rounded border px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
              value.trim() === map.id
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border bg-white/5 text-white/80 hover:bg-white/10 hover:border-primary/40',
            )}
          >
            {map.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={change}
          disabled={!value.trim() || busy}
          className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-md font-semibold text-xs hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          Сменить
        </button>
        <button
          onClick={restart}
          disabled={busy || !currentMap || currentMap === '---'}
          className="flex items-center justify-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
        >
          <RotateCcw size={12} />
          Перезапустить
        </button>
      </div>
      <p className="text-[9px] text-muted-foreground">Команда: {command}</p>
    </div>
  );
}

function TeamNameField({ label, teams, value, onChange, onSubmit }: {
  label: string;
  teams: string[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-1">
      <select
        value={teams.includes(value) ? value : ''}
        onChange={(e) => { if (e.target.value) onChange(e.target.value) }}
        aria-label={`${label}: выбрать из списка`}
        disabled={teams.length === 0}
        className="w-full bg-black/40 border border-border rounded px-2 py-1 text-[11px] text-white outline-none focus:border-primary disabled:opacity-50"
      >
        <option value="">{teams.length > 0 ? 'Выбрать из списка…' : 'Список пуст — вкладка «Команды»'}</option>
        {teams.map((team) => (
          <option key={team} value={team}>{team}</option>
        ))}
      </select>
      <div className="flex gap-1 min-w-0">
        <input
          placeholder={label}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-black/40 border border-border rounded px-2 py-1 text-[11px] outline-none focus:border-primary"
        />
        <button
          onClick={onSubmit}
          disabled={!value.trim()}
          className="shrink-0 bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-[10px] font-bold disabled:opacity-40"
        >
          Задать
        </button>
      </div>
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
      className="w-full flex items-center justify-center px-2 py-1.5 rounded border border-border bg-white/5 hover:bg-white/10 hover:border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all text-[11px] font-medium text-white text-center disabled:opacity-50 leading-tight"
    >
      {label}
    </button>
  );
}
