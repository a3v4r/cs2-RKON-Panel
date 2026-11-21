import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';
import { isRunning } from './instances';
import { cs2Paths, readSettings, writeSettings } from './panel-settings';
import { servers } from './store';

// Backup Management, as in Quatrix, for what a tournament PC has to keep:
//   panel - the panel's own data (servers, templates, settings, map configs, chat history)
//   cs2   - the CS2 server configs: game\csgo\cfg and the CounterStrikeSharp / MatchZy configs
// Zip archives are made and unpacked by PowerShell (Compress-Archive / Expand-Archive): no extra packages.

export type Scope = 'panel' | 'cs2';
export const SCOPES: Scope[] = ['panel', 'cs2'];

export interface Backup {
  id: string; // "<scope>/<file name>"
  scope: Scope;
  filename: string;
  type: 'manual' | 'auto' | 'upload';
  size: number;
  createdAt: string;
}

export interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM, local time of the panel PC
  keep: number; // automatic backups kept per scope
}

const DEFAULT_SCHEDULE: BackupSchedule = { enabled: false, frequency: 'daily', time: '04:00', keep: 7 };

const root = () => path.join(dataDir(), 'backups');
const scopeDir = (scope: Scope) => path.join(root(), scope);

function sources(scope: Scope): { base: string; items: string[] } {
  if (scope === 'panel') {
    const base = dataDir();
    // The backups themselves stay out; process PIDs and the session key are machine-bound
    const skip = new Set(['backups', 'processes.json']);
    const items = fs.existsSync(base) ? fs.readdirSync(base).filter((n) => !skip.has(n) && !n.endsWith('.tmp')) : [];
    return { base, items };
  }
  const csgo = cs2Paths().csgo;
  const items = ['cfg', path.join('addons', 'counterstrikesharp', 'configs')].filter((p) => fs.existsSync(path.join(csgo, p)));
  return { base: csgo, items };
}

const ps = (command: string, timeout = 300_000) =>
  new Promise<void>((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', "$ProgressPreference = 'SilentlyContinue'; " + command], { windowsHide: true, timeout }, (err, _o, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()));
      else resolve();
    });
  });
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '');

function typeOf(filename: string): Backup['type'] {
  return filename.startsWith('auto_') ? 'auto' : filename.startsWith('upload_') ? 'upload' : 'manual';
}

export function listBackups(scope: Scope): Backup[] {
  const dir = scopeDir(scope);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith('.zip'))
    .map((filename) => {
      const st = fs.statSync(path.join(dir, filename));
      return { id: `${scope}/${filename}`, scope, filename, type: typeOf(filename), size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// "<scope>/<file>.zip" -> absolute path inside the backups folder, or an error
export function backupPath(id: string) {
  const [scope, filename] = id.split('/');
  if (!SCOPES.includes(scope as Scope) || !filename || !/^[\w.-]+\.zip$/.test(filename)) throw new Error('Неверный бэкап');
  return { scope: scope as Scope, file: path.join(scopeDir(scope as Scope), filename) };
}

export async function createBackup(scope: Scope, type: 'manual' | 'auto' = 'manual') {
  const { base, items } = sources(scope);
  if (!items.length) throw new Error(scope === 'cs2' ? 'Не найдены конфиги CS2: проверьте папку сервера в настройках' : 'Нет данных панели');
  fs.mkdirSync(scopeDir(scope), { recursive: true });
  const filename = `${type}_${scope}_${stamp()}.zip`;
  const target = path.join(scopeDir(scope), filename);
  const list = items.map((i) => q(path.join(base, i))).join(', ');
  await ps(`Compress-Archive -Path ${list} -DestinationPath ${q(target)} -Force`);
  return listBackups(scope).find((b) => b.filename === filename)!;
}

export async function restoreBackup(id: string) {
  const { scope, file } = backupPath(id);
  if (!fs.existsSync(file)) throw new Error('Бэкап не найден');
  if (scope === 'cs2' && servers.list().some((s) => s.managed && isRunning(s.id))) {
    throw new Error('Остановите серверы, запущенные из панели, и повторите');
  }
  const dest = scope === 'panel' ? dataDir() : cs2Paths().csgo;
  // Compress-Archive keeps the top folder names (cfg, configs...), so cs2 configs go back by their own paths
  if (scope === 'cs2') {
    const tmp = path.join(root(), `restore_${Date.now()}`);
    await ps(`Expand-Archive -Path ${q(file)} -DestinationPath ${q(tmp)} -Force`);
    try {
      for (const name of fs.readdirSync(tmp)) {
        const to = name === 'configs' ? path.join(dest, 'addons', 'counterstrikesharp', 'configs') : path.join(dest, name);
        fs.cpSync(path.join(tmp, name), to, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    return;
  }
  await ps(`Expand-Archive -Path ${q(file)} -DestinationPath ${q(dest)} -Force`);
}

export function deleteBackup(id: string) {
  const { file } = backupPath(id);
  fs.rmSync(file, { force: true });
}

export function saveUpload(scope: Scope, name: string, data: Buffer) {
  if (data.subarray(0, 2).toString() !== 'PK') throw new Error('Это не zip-архив');
  fs.mkdirSync(scopeDir(scope), { recursive: true });
  const clean = name.replace(/\.zip$/i, '').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'backup';
  const filename = `upload_${scope}_${stamp()}_${clean}.zip`;
  fs.writeFileSync(path.join(scopeDir(scope), filename), data);
  return listBackups(scope).find((b) => b.filename === filename)!;
}

// --- Schedule ---

export const readSchedule = (): BackupSchedule => ({ ...DEFAULT_SCHEDULE, ...(readSettings() as { backupSchedule?: BackupSchedule }).backupSchedule });

export function writeSchedule(s: BackupSchedule) {
  writeSettings({ backupSchedule: s } as never);
}

const g = globalThis as unknown as { backupTimer?: NodeJS.Timeout; backupLastRun?: string };

async function tick() {
  const s = readSchedule();
  if (!s.enabled) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm !== s.time) return;
  if (s.frequency === 'weekly' && now.getDay() !== 0) return;
  if (s.frequency === 'monthly' && now.getDate() !== 1) return;
  const key = now.toDateString() + hhmm;
  if (g.backupLastRun === key) return;
  g.backupLastRun = key;
  for (const scope of SCOPES) {
    await createBackup(scope, 'auto').catch(() => {});
    // keep only the newest automatic backups
    listBackups(scope).filter((b) => b.type === 'auto').slice(s.keep).forEach((b) => deleteBackup(b.id));
  }
}

export function startBackupScheduler() {
  if (g.backupTimer) return;
  g.backupTimer = setInterval(() => { tick().catch(() => {}); }, 30_000);
}
