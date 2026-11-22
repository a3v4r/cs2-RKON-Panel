import { ChildProcess, execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dataDir } from './accounts';
import { cs2Paths, readSettings } from './panel-settings';
import { isEnabled, isInstalled, pluginJobRunning } from './plugins';
import { servers } from './store';

// The skins website (skins-site/ next to the panel) for players: the panel runs it as a separate process
// on port 80 while WeaponPaints is on and hands it the servers, so there is nothing to set up by hand.
// It is a separate process on purpose: players open it, and it must not expose the panel itself.

export const DEFAULT_SKINS_PORT = 80;
const SYNC_MS = 15_000;
const STOP_WAIT_MS = 5_000;
const LOG_LINES = 50;

type SiteState = 'off' | 'starting' | 'running' | 'crashed';

interface Site {
  state: SiteState;
  message?: string;
  child?: ChildProcess;
  port?: number;
  startedAt?: number;
  log: string[];
  stopping?: boolean;
  paused?: boolean; // a plugin job moves the WeaponPaints folder: the site must not hold its database
}

const g = globalThis as unknown as { skinsSite?: Site; skinsSiteTimer?: NodeJS.Timeout };
const site = (): Site => (g.skinsSite ??= { state: 'off', log: [] });

const siteDir = () => process.env.SKINS_SITE_DIR || path.join(process.cwd(), 'skins-site');
const workDir = () => path.join(dataDir(), 'skins-site');
const configFile = () => path.join(workDir(), 'config.json');
const pidFile = () => path.join(workDir(), 'site.pid');
const weaponPaintsDir = () => path.join(cs2Paths().csgo, 'addons', 'counterstrikesharp', 'plugins', 'WeaponPaints');

export const skinsSiteEnabled = () => readSettings().skinsSite?.enabled !== false;
export const skinsSitePort = () => readSettings().skinsSite?.port ?? DEFAULT_SKINS_PORT;

function addLog(text: string) {
  const s = site();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) s.log.push(line.trimEnd());
  }
  if (s.log.length > LOG_LINES) s.log.splice(0, s.log.length - LOG_LINES);
}

// ---- Address players open, as the plugin's !site shows it

const isPrivate = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

function lanIp() {
  return Object.values(os.networkInterfaces()).flat()
    .find((a) => a && a.family === 'IPv4' && !a.internal && isPrivate(a.address))?.address ?? null;
}

export function skinsSiteAddress(port = skinsSitePort()) {
  const name = os.hostname().toLowerCase();
  // Generated names like DESKTOP-7H3K2LF are hard to type: the LAN IP then
  const host = /^(desktop|win|laptop)-[a-z0-9]{5,}$/.test(name) ? lanIp() ?? name : name;
  return port === 80 ? `${host}/` : `${host}:${port}/`;
}

// ---- Files the site reads

function secret() {
  const file = path.join(workDir(), 'secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

// Rewritten only on a change: the site re-reads the server list when the file changes
function writeConfig(port: number) {
  fs.mkdirSync(workDir(), { recursive: true });
  const config = {
    port,
    host: '0.0.0.0',
    publicUrl: `http://${skinsSiteAddress(port).replace(/\/$/, '')}`,
    pluginDir: weaponPaintsDir(),
    language: 'ru',
    imageCacheDir: path.join(workDir(), 'image-cache'),
    sessionSecret: secret(),
    devLogin: false,
    servers: servers.list()
      .sort((a, b) => a.id - b.id)
      .map((s) => ({ name: s.name, host: s.host, port: s.port, rconPassword: s.rcon_password })),
  };
  const text = JSON.stringify(config, null, 2);
  let old = '';
  try {
    old = fs.readFileSync(configFile(), 'utf8');
  } catch {
    // first start
  }
  if (old !== text) {
    fs.writeFileSync(configFile() + '.tmp', text);
    fs.renameSync(configFile() + '.tmp', configFile());
  }
}

// !site and the in-game menu pictures: "auto" works for port 80, any other port needs the full address
function syncPluginWebsite(port: number) {
  const file = path.join(cs2Paths().csgo, 'addons', 'counterstrikesharp', 'configs', 'plugins', 'WeaponPaints', 'WeaponPaints.json');
  if (!fs.existsSync(file)) return;
  const value = port === 80 ? 'auto' : `http://${lanIp() ?? skinsSiteAddress(port).split(':')[0]}:${port}/`;
  // CounterStrikeSharp starts the file with a // comment, so it is edited as text, not JSON.parse
  const text = fs.readFileSync(file, 'utf8');
  const re = /"Website"\s*:\s*"(?:[^"\\]|\\.)*"/;
  const next = re.test(text) ? text.replace(re, `"Website": ${JSON.stringify(value)}`) : text.replace('{', `{\n  "Website": ${JSON.stringify(value)},`);
  if (next !== text) fs.writeFileSync(file, next);
}

// ---- Process

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// A site left running by a panel that was closed: stop it, or it keeps the port
async function killLeftover() {
  let pid = 0;
  try {
    pid = Number(fs.readFileSync(pidFile(), 'utf8'));
  } catch {
    return;
  }
  fs.rmSync(pidFile(), { force: true });
  if (!pid || !alive(pid)) return;
  const commandLine = await new Promise<string>((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
    { windowsHide: true, timeout: 20_000 }, (err, out) => resolve(err ? '' : out));
  });
  // Only our own server.mjs: the PID may belong to another program by now
  if (!commandLine.includes(path.join(siteDir(), 'server.mjs'))) return;
  try {
    process.kill(pid);
  } catch {
    return;
  }
  for (let waited = 0; waited < STOP_WAIT_MS && alive(pid); waited += 200) await sleep(200);
}

function start(port: number) {
  const s = site();
  const script = path.join(siteDir(), 'server.mjs');
  writeConfig(port);
  syncPluginWebsite(port);

  // Only what the site needs: not the panel's passwords
  const env: Record<string, string> = { SKINS_CONFIG: configFile(), NODE_ENV: 'production', ...(process.env.MATCHDESK_EXE ? { MATCHDESK_EXE: '1' } : {}) };
  for (const key of ['SystemRoot', 'PATH', 'Path', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'COMPUTERNAME']) {
    const value = process.env[key];
    if (value) env[key] = value;
  }

  // Matchdesk.exe runs the panel's scripts itself (launcher/main.cjs); plain node takes the file
  const args = process.env.MATCHDESK_EXE === '1' ? ['--run-script', script] : ['--disable-warning=ExperimentalWarning', script];
  const child = spawn(process.execPath, args, {
    cwd: siteDir(), env: env as unknown as NodeJS.ProcessEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  Object.assign(s, { state: 'starting', message: undefined, child, port, startedAt: Date.now(), log: [], stopping: false });
  if (child.pid) fs.writeFileSync(pidFile(), String(child.pid));

  child.stdout?.setEncoding('utf8').on('data', (text: string) => {
    addLog(text);
    if (site().child === child && text.includes('Сайт скинов:')) site().state = 'running';
  });
  child.stderr?.setEncoding('utf8').on('data', (text: string) => addLog(text));
  child.on('error', (e) => addLog(e.message));
  child.on('exit', (code) => {
    if (site().child !== child) return;
    fs.rmSync(pidFile(), { force: true });
    const cur = site();
    cur.child = undefined;
    if (cur.stopping) {
      cur.state = 'off';
      return;
    }
    const busy = cur.log.some((l) => l.includes('EADDRINUSE'));
    cur.state = 'crashed';
    cur.message = busy
      ? `Порт ${port} занят другой программой. Освободите его или выберите другой порт.`
      : `Сайт остановился${code === null ? '' : ` (код ${code})`}. Панель запустит его снова.`;
  });
}

async function stop() {
  const s = site();
  const child = s.child;
  if (!child) {
    s.state = 'off';
    return;
  }
  s.stopping = true;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill();
  await Promise.race([exited, sleep(STOP_WAIT_MS)]);
}

// ---- What should run, checked on a timer and after changes

function why(): string | null {
  if (!skinsSiteEnabled()) return 'Выключен в настройках';
  if (site().paused || pluginJobRunning()) return 'Остановлен на время работы с плагинами';
  if (!isInstalled('weaponpaints') || !isEnabled('weaponpaints')) return 'Работает только вместе с WeaponPaints: включите плагин';
  if (!fs.existsSync(path.join(siteDir(), 'server.mjs'))) return `Не найдены файлы сайта (${siteDir()})`;
  if (!fs.existsSync(weaponPaintsDir())) return 'Не найдена папка WeaponPaints';
  return null;
}

let syncing: Promise<void> | null = null;

export function syncSkinsSite(): Promise<void> {
  syncing ??= (async () => {
    try {
      const s = site();
      const blocked = why();
      const port = skinsSitePort();
      if (blocked) {
        await stop();
        s.message = blocked;
        return;
      }
      if (s.child && s.port !== port) await stop();
      if (s.child) {
        writeConfig(port); // new or edited servers
        return;
      }
      await killLeftover();
      start(port);
    } catch (e) {
      Object.assign(site(), { state: 'crashed', message: (e as Error).message });
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export async function restartSkinsSite() {
  await stop();
  await syncSkinsSite();
}

// Plugin jobs move or overwrite the WeaponPaints folder, which the site keeps open
export async function pauseSkinsSite() {
  site().paused = true;
  await syncing;
  await stop();
}

export function resumeSkinsSite() {
  site().paused = false;
  syncSkinsSite().catch(() => {});
}

export function startSkinsSite() {
  if (g.skinsSiteTimer) return;
  syncSkinsSite().catch(() => {});
  g.skinsSiteTimer = setInterval(() => { syncSkinsSite().catch(() => {}); }, SYNC_MS);
  process.once('exit', () => site().child?.kill());
}

export function skinsSiteView() {
  const s = site();
  const port = skinsSitePort();
  return {
    enabled: skinsSiteEnabled(),
    port,
    state: s.state,
    message: s.message ?? null,
    address: skinsSiteAddress(port),
    log: s.log.slice(-15),
  };
}
