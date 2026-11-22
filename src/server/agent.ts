import fs from 'node:fs';
import path from 'node:path';
import { queryInfo } from './a2s';
import { audit, readAudit } from './auth';
import { SessionUser } from './session';
import { chatSince } from './chat-log';
import { procState, restartServer, startServer, stopServer } from './instances';
import { getLive } from './live';
import { cs2Paths, readSettings, writeSettings } from './panel-settings';
import { livePlayers } from './players';
import { pluginsView } from './plugins';
import { rconCommand } from './rcon';
import { StoredServer, servers } from './store';

// The "Agent" tab: a chat with a language model that can look at the panel's servers itself.
// Any OpenAI-compatible chat completions API works (OpenRouter by default, DeepSeek, a local Ollama...): plain
// fetch, no SDK. Reading tools run at once; tools that change something (RCON, start / stop) only run after the
// user presses "Run" in the chat. The conversation lives in the browser and is sent with every turn.

export const DEFAULT_AGENT_URL = 'https://openrouter.ai/api/v1';
const MAX_STEPS = 10; // model calls per turn
const TOOL_OUTPUT_CHARS = 12_000;
const REQUEST_TIMEOUT_MS = 120_000;

export interface AgentSettings {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface PendingAction {
  id: string;
  tool: string;
  description: string;
}

// ---- Settings ---------------------------------------------------------------------------------------------

const agentSettings = (): AgentSettings => readSettings().agent ?? {};

export function agentView() {
  const s = agentSettings();
  return {
    baseUrl: s.baseUrl || DEFAULT_AGENT_URL,
    model: s.model ?? '',
    hasKey: Boolean(s.apiKey),
    configured: Boolean(s.model),
  };
}

export function saveAgentSettings(update: { baseUrl?: unknown; apiKey?: unknown; model?: unknown }) {
  const next: AgentSettings = { ...agentSettings() };
  if (update.baseUrl !== undefined) {
    const url = String(update.baseUrl).trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//i.test(url)) throw new Error('Адрес API должен начинаться с http:// или https://');
    next.baseUrl = url || undefined;
  }
  // Empty key in the form = keep the saved one; "-" clears it (Ollama needs none)
  if (update.apiKey !== undefined && String(update.apiKey).trim() !== '') {
    const key = String(update.apiKey).trim();
    next.apiKey = key === '-' ? undefined : key;
  }
  if (update.model !== undefined) next.model = String(update.model).trim() || undefined;
  writeSettings({ agent: next });
  return agentView();
}

function connection() {
  const s = agentSettings();
  if (!s.model) throw new Error('Агент не настроен: укажите модель в настройках агента.');
  return { baseUrl: s.baseUrl || DEFAULT_AGENT_URL, apiKey: s.apiKey ?? '', model: s.model };
}

function headers(apiKey: string) {
  const h: Record<string, string> = { 'content-type': 'application/json', 'X-Title': 'Matchdesk' };
  if (apiKey) h.authorization = `Bearer ${apiKey}`;
  return h;
}

async function apiError(res: Response) {
  const text = await res.text().catch(() => '');
  let message = text.slice(0, 300);
  try {
    const body = JSON.parse(text);
    message = body?.error?.message ?? body?.message ?? message;
  } catch {
    // plain text answer
  }
  return new Error(`API модели ответил ${res.status}${message ? `: ${message}` : ''}`);
}

// Models of the provider, for the settings form; with OpenRouter only those that can call tools
export async function listModels() {
  const { baseUrl, apiKey } = { baseUrl: agentSettings().baseUrl || DEFAULT_AGENT_URL, apiKey: agentSettings().apiKey ?? '' };
  const res = await fetch(`${baseUrl}/models`, { headers: headers(apiKey), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw await apiError(res);
  const body = await res.json() as { data?: { id: string; name?: string; supported_parameters?: string[]; pricing?: { prompt?: string; completion?: string } }[] };
  return (body.data ?? [])
    .filter((m) => !m.supported_parameters || m.supported_parameters.includes('tools'))
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      // OpenRouter: dollars per token, as strings
      price: m.pricing?.prompt !== undefined && m.pricing?.completion !== undefined
        ? { input: Number(m.pricing.prompt) * 1e6, output: Number(m.pricing.completion) * 1e6 }
        : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---- Tools ------------------------------------------------------------------------------------------------

interface Tool {
  description: string;
  parameters: Record<string, unknown>;
  action?: (args: Record<string, unknown>) => string; // set: needs the user's OK; returns what is about to happen
  run: (args: Record<string, unknown>, user: SessionUser) => Promise<string>;
}

const serverIdParam = { server_id: { type: 'integer', description: 'ID сервера из list_servers' } };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

function serverById(args: Record<string, unknown>): StoredServer {
  const id = Number(args.server_id);
  const server = servers.get(id);
  if (!server) throw new Error(`Сервера с ID ${args.server_id} нет`);
  return server;
}

const clip = (text: string) => (text.length > TOOL_OUTPUT_CHARS ? `...${text.slice(-TOOL_OUTPUT_CHARS)}` : text);

function tailLines(file: string, lines: number) {
  const size = fs.statSync(file).size;
  const length = Math.min(size, 512 * 1024);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    return buf.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-lines).join('\n');
  } finally {
    fs.closeSync(fd);
  }
}

// Newest CounterStrikeSharp log whose name starts with `prefix` (log-all, log-WeaponPaints, log-MatchZy...)
function newestCssLog(prefix: string) {
  const dir = path.join(cs2Paths().csgo, 'addons', 'counterstrikesharp', 'logs');
  const files = fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().startsWith(prefix.toLowerCase()) && f.endsWith('.txt'))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  // The plugin logs start a new (often empty) file on each load: take the newest one with text
  return files.find((f) => fs.statSync(f).size > 0) ?? files[0];
}

const TOOLS: Record<string, Tool> = {
  list_servers: {
    description: 'Список серверов CS2 в панели: ID, название, адрес, режим (MatchZy или Vanilla), запущен ли процесс панелью.',
    parameters: obj({}),
    run: async () => JSON.stringify(servers.list().sort((a, b) => a.id - b.id).map((s) => ({
      id: s.id,
      name: s.name,
      address: `${s.host}:${s.port}`,
      mode: s.mode === 'vanilla' ? 'vanilla' : 'matchzy',
      started_by_panel: Boolean(s.managed),
      process: s.managed ? procState(s.id).state : 'не управляется панелью',
    }))),
  },
  server_status: {
    description: 'Состояние сервера: отвечает ли он, карта, число игроков и ботов, процесс, и текущий матч (команды, счёт, стороны), если он идёт.',
    parameters: obj(serverIdParam, ['server_id']),
    run: async (args) => {
      const server = serverById(args);
      const result: Record<string, unknown> = { id: server.id, name: server.name };
      if (server.managed) result.process = procState(server.id);
      try {
        const info = await queryInfo(server.host, server.port);
        Object.assign(result, { online: true, map: info.map, players: info.players, max_players: info.maxPlayers, bots: info.bots, ping_ms: info.ping });
      } catch (e) {
        Object.assign(result, { online: false, error: (e as Error).message });
      }
      const live = getLive(server.id);
      if (live?.matchid) {
        result.match = {
          matchid: live.matchid,
          map: live.mapName,
          map_number: live.mapNumber,
          finished: live.finished,
          team1: { name: live.team1.name, score: live.team1.score, side: live.team1.side, series: live.team1.seriesScore },
          team2: { name: live.team2.name, score: live.team2.score, side: live.team2.side, series: live.team2.seriesScore },
          rounds_played: live.rounds.length,
          updated_at: live.updatedAt,
        };
      }
      return JSON.stringify(result);
    },
  },
  list_players: {
    description: 'Игроки на сервере сейчас (по RCON status): userid (нужен для kickid), ник, SteamID, IP, пинг, время на сервере.',
    parameters: obj(serverIdParam, ['server_id']),
    run: async (args) => JSON.stringify(await livePlayers(serverById(args))),
  },
  recent_chat: {
    description: 'Последние сообщения игрового чата сервера (все и командный).',
    parameters: obj({ ...serverIdParam, limit: { type: 'integer', description: 'Сколько последних сообщений, по умолчанию 30' } }, ['server_id']),
    run: async (args) => {
      const server = serverById(args);
      const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 200);
      return JSON.stringify(chatSince(server.id).slice(-limit).map((m) => ({
        time: new Date(m.t).toISOString(), name: m.name, team: m.team, team_only: m.type === 'say_team', text: m.text,
      })));
    },
  },
  read_log: {
    description: 'Последние строки лога. source: server_console - консоль сервера CS2, запущенного панелью (нужен server_id); counterstrikesharp - общий лог CounterStrikeSharp и плагинов; weaponpaints - лог плагина скинов; matchzy - лог MatchZy.',
    parameters: obj({
      source: { type: 'string', enum: ['server_console', 'counterstrikesharp', 'weaponpaints', 'matchzy'] },
      server_id: { type: 'integer', description: 'Только для server_console' },
      lines: { type: 'integer', description: 'Сколько последних строк, по умолчанию 80, не больше 300' },
    }, ['source']),
    run: async (args) => {
      const lines = Math.min(Math.max(Number(args.lines) || 80, 1), 300);
      let file: string | undefined;
      if (args.source === 'server_console') file = path.join(cs2Paths().csgo, `console_server${serverById(args).id}.log`);
      else if (args.source === 'counterstrikesharp') file = newestCssLog('log-all');
      else if (args.source === 'weaponpaints') file = newestCssLog('log-WeaponPaints');
      else if (args.source === 'matchzy') file = newestCssLog('log-MatchZy');
      else throw new Error('Неизвестный source');
      if (!file || !fs.existsSync(file)) return 'Такого лога нет';
      return clip(`${path.basename(file)}:\n${tailLines(file, lines)}`);
    },
  },
  plugins_status: {
    description: 'Плагины сервера (Metamod, CounterStrikeSharp, MatchZy, WeaponPaints): установлен ли, включён ли, версия, есть ли обновление, и проблемы, которые плагин сам записал в лог.',
    parameters: obj({}),
    run: async () => {
      const view = pluginsView();
      return JSON.stringify({
        plugins: view.plugins.map((p) => ({
          name: p.name, installed: p.installed, enabled: p.enabled, version: p.version, latest: p.latest,
          update_available: p.updateAvailable, problem: p.problem,
        })),
        visual_cpp_runtime_installed: view.vcRedist,
        last_job: view.job.title ? { title: view.job.title, running: view.job.running, ok: view.job.ok, message: view.job.message } : null,
      });
    },
  },
  audit_log: {
    description: 'Журнал действий в панели: кто, когда и что делал (паузы, RCON-команды, загрузки матчей, изменения настроек).',
    parameters: obj({ limit: { type: 'integer', description: 'Сколько последних записей, по умолчанию 30' } }),
    run: async (args) => JSON.stringify(readAudit(Math.min(Math.max(Number(args.limit) || 30, 1), 200))),
  },
  rcon: {
    description: 'Выполнить RCON-команду на сервере. Перед выполнением панель спрашивает подтверждение у пользователя.',
    parameters: obj({ ...serverIdParam, command: { type: 'string', description: 'Команда консоли CS2, например mp_pause_match' } }, ['server_id', 'command']),
    action: (args) => {
      const server = serverById(args);
      return `RCON на «${server.name}» (#${server.id}): ${String(args.command ?? '').trim()}`;
    },
    run: async (args, user) => {
      const server = serverById(args);
      const command = String(args.command ?? '').trim();
      if (!command) throw new Error('Пустая команда');
      audit(user, `agent rcon #${server.id}: ${command}`);
      const out = await rconCommand(server.host, server.port, server.rcon_password, command);
      // sv_logecho mixes log lines into the answer
      return clip(out.split(/\r?\n/).filter((l) => l.trim() && !/^L \d\d\/\d\d\/\d{4}/.test(l)).join('\n') || '(пустой ответ)');
    },
  },
  server_process: {
    description: 'Запустить, остановить или перезапустить сервер, который запускает панель. Перед выполнением панель спрашивает подтверждение у пользователя.',
    parameters: obj({ ...serverIdParam, action: { type: 'string', enum: ['start', 'stop', 'restart'] } }, ['server_id', 'action']),
    action: (args) => {
      const server = serverById(args);
      const what = { start: 'Запустить', stop: 'Остановить', restart: 'Перезапустить' }[String(args.action)] ?? String(args.action);
      return `${what} сервер «${server.name}» (#${server.id})`;
    },
    run: async (args, user) => {
      const server = serverById(args);
      if (!server.managed) throw new Error('Этот сервер запущен не панелью, панель не может им управлять');
      const action = String(args.action);
      if (action === 'start') await startServer(server.id);
      else if (action === 'stop') await stopServer(server.id);
      else if (action === 'restart') await restartServer(server.id);
      else throw new Error('Неизвестное действие');
      audit(user, `agent server ${action} #${server.id}`);
      return `Готово: ${JSON.stringify(procState(server.id))}`;
    },
  },
};

const TOOL_SPECS = Object.entries(TOOLS).map(([name, t]) => ({
  type: 'function' as const,
  function: { name, description: t.description, parameters: t.parameters },
}));

const SYSTEM_PROMPT = `Ты помощник судьи в Matchdesk - панели управления серверами CS2 для турниров в локальной сети (компьютерный клуб).
Отвечай по-русски, коротко и по делу. Вместо длинного тире пиши обычный дефис.

Как работать:
- О состоянии серверов, игроков, матчей, плагинов и логов узнавай через инструменты, не выдумывай. Если данных не хватает, так и скажи.
- Инструменты rcon и server_process меняют что-то на сервере. Вызывай их, когда пользователь просит что-то сделать: панель сама покажет ему действие и спросит подтверждение. Не спрашивай подтверждение текстом, просто вызови инструмент.
- Не выполняй действий, о которых пользователь не просил. Если неясно, на каком сервере, спроси или сначала посмотри list_servers.
- Если пользователь отменил действие, не повторяй его.

Полезные команды RCON (CS2 и MatchZy):
- say <текст> - сообщение всем в чат;
- mp_pause_match / mp_unpause_match - пауза и снятие паузы;
- css_start - форс-старт матча MatchZy; css_roundknife - включить или выключить ножевой раунд MatchZy;
- get5_status - состояние матча MatchZy;
- changelevel <карта> - смена карты, например changelevel de_mirage;
- kickid <userid> "<причина>" - кик, userid бери из list_players;
- mp_restartgame 1 - рестарт игры;
- status - игроки и состояние сервера.`;

// ---- Conversation -----------------------------------------------------------------------------------------

function cleanMessages(input: unknown): AgentMessage[] {
  if (!Array.isArray(input)) throw new Error('Нет сообщений');
  if (input.length > 400) throw new Error('Слишком длинный разговор: начните новый');
  return input.map((m) => {
    const role = m?.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'tool') throw new Error('Неверное сообщение');
    const msg: AgentMessage = { role, content: m.content == null ? null : String(m.content) };
    if (role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      msg.tool_calls = m.tool_calls.map((c: ToolCall) => ({
        id: String(c.id), type: 'function', function: { name: String(c.function?.name), arguments: String(c.function?.arguments ?? '{}') },
      }));
    }
    if (role === 'tool') msg.tool_call_id = String(m.tool_call_id);
    return msg;
  });
}

function parseArgs(raw: string): Record<string, unknown> {
  const value = JSON.parse(raw || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('аргументы не объект');
  return value;
}

// Tool calls of the last assistant message that have no answer yet
function unanswered(messages: AgentMessage[]) {
  const last = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!last?.tool_calls) return [];
  const answered = new Set(messages.filter((m) => m.role === 'tool').map((m) => m.tool_call_id));
  return last.tool_calls.filter((c) => !answered.has(c.id));
}

async function callModel(messages: AgentMessage[]) {
  const { baseUrl, apiKey, model } = connection();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      tools: TOOL_SPECS,
      tool_choice: 'auto',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw await apiError(res);
  const body = await res.json() as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[]; error?: { message?: string } };
  if (body.error) throw new Error(`API модели: ${body.error.message ?? 'ошибка'}`);
  const msg = body.choices?.[0]?.message;
  if (!msg) throw new Error('API модели вернул пустой ответ');
  const reply: AgentMessage = { role: 'assistant', content: msg.content ?? null };
  if (msg.tool_calls?.length) {
    reply.tool_calls = msg.tool_calls.map((c, i) => ({
      id: c.id || `call_${Date.now()}_${i}`,
      type: 'function',
      function: { name: c.function?.name ?? '', arguments: c.function?.arguments ?? '{}' },
    }));
  }
  return reply;
}

async function runTool(call: ToolCall, user: SessionUser): Promise<string> {
  const tool = TOOLS[call.function.name];
  if (!tool) return `Ошибка: инструмента ${call.function.name} нет`;
  try {
    return await tool.run(parseArgs(call.function.arguments), user);
  } catch (e) {
    return `Ошибка: ${(e as Error).message}`;
  }
}

// One user turn: the model reads what it needs; actions wait for the user's decision (`decisions` by tool call id)
export async function agentTurn(input: unknown, decisions: Record<string, unknown> | undefined, user: SessionUser) {
  const messages = cleanMessages(input);

  // Answer the actions the user has just decided on. A new question instead of a decision skips them; the
  // answers must stand right after the assistant message that asked, before that question.
  const waiting = unanswered(messages);
  if (waiting.length && decisions) {
    for (const call of waiting) {
      const content = decisions[call.id] === 'run'
        ? await runTool(call, user)
        : 'Пользователь отменил это действие.';
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
  } else if (waiting.length) {
    let lastAssistant = -1;
    messages.forEach((m, i) => { if (m.role === 'assistant') lastAssistant = i; });
    const question = messages.findIndex((m, i) => i > lastAssistant && m.role === 'user');
    if (question < 0) throw new Error('Сначала подтвердите или отмените предложенные действия');
    messages.splice(question, 0, ...waiting.map((call): AgentMessage => ({
      role: 'tool', tool_call_id: call.id, content: 'Пользователь не стал выполнять это действие и задал новый вопрос.',
    })));
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callModel(messages);
    messages.push(reply);
    if (!reply.tool_calls?.length) return { messages, pending: [] as PendingAction[] };

    const pending: PendingAction[] = [];
    for (const call of reply.tool_calls) {
      const tool = TOOLS[call.function.name];
      if (tool?.action) {
        try {
          pending.push({ id: call.id, tool: call.function.name, description: tool.action(parseArgs(call.function.arguments)) });
          continue;
        } catch (e) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: `Ошибка: ${(e as Error).message}` });
          continue;
        }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: await runTool(call, user) });
    }
    if (pending.length) return { messages, pending };
  }
  messages.push({ role: 'assistant', content: 'Остановился: слишком много шагов подряд. Уточните вопрос.' });
  return { messages, pending: [] as PendingAction[] };
}
