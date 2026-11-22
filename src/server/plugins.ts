import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dataDir } from './accounts';
import { anyCs2Running, isUpdating } from './cs2-update';
import { cs2Paths } from './panel-settings';
import { servers } from './store';

// Plugins of the CS2 install (one set for every server on this PC): Metamod, CounterStrikeSharp and the CounterStrikeSharp
// plugins. The panel downloads them (official builds, the forks from their GitHub releases), turns them on and off
// and updates them on request only. Everything here changes files cs2.exe keeps open, so all servers must be stopped.

export type PluginId = 'metamod' | 'counterstrikesharp' | 'matchzy' | 'weaponpaints';

type Source = { type: 'mms' } | { type: 'github'; repo: string; asset: RegExp };

interface PluginDef {
  id: PluginId;
  name: string;
  requires?: PluginId;
  folder?: string; // folder in addons/counterstrikesharp/plugins
  source: Source;
}

export const PLUGINS: PluginDef[] = [
  { id: 'metamod', name: 'Metamod:Source', source: { type: 'mms' } },
  {
    id: 'counterstrikesharp',
    name: 'CounterStrikeSharp',
    requires: 'metamod',
    // with the .NET runtime: the plugins need the one CounterStrikeSharp was built with
    source: { type: 'github', repo: 'roflmuffin/CounterStrikeSharp', asset: /^counterstrikesharp-with-runtime-windows-.*\.zip$/i },
  },
  { id: 'matchzy', name: 'MatchZy', requires: 'counterstrikesharp', folder: 'MatchZy', source: { type: 'github', repo: 'a3v4r/MatchZy-Patched', asset: /\.zip$/i } },
  { id: 'weaponpaints', name: 'WeaponPaints', requires: 'counterstrikesharp', folder: 'WeaponPaints', source: { type: 'github', repo: 'a3v4r/cs2-WeaponPaints-sqlite', asset: /\.zip$/i } },
];

const def = (id: PluginId) => PLUGINS.find((p) => p.id === id)!;
const dependents = (id: PluginId) => PLUGINS.filter((p) => p.requires === id).map((p) => p.id);

interface Release {
  version: string; // release tag or file name
  file: string;
  url: string;
  updatedAt: string; // the forks re-upload the zip under the same tag, so the date tells a new build apart
}

interface PluginRecord {
  enabled?: boolean;
  version?: string;
  updatedAt?: string;
  installedAt?: number;
  file?: string; // the installed zip in data/plugin-cache/<id>
  previous?: { version: string; updatedAt: string; file: string }; // the one before it, for a rollback
}

type Records = Partial<Record<PluginId, PluginRecord>>;

const recordsFile = () => path.join(dataDir(), 'plugins.json');
const cacheDir = (id: PluginId) => path.join(dataDir(), 'plugin-cache', id);

function readRecords(): Records {
  try {
    return JSON.parse(fs.readFileSync(recordsFile(), 'utf8')) as Records;
  } catch {
    return {};
  }
}

function writeRecords(records: Records) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(recordsFile() + '.tmp', JSON.stringify(records, null, 2));
  fs.renameSync(recordsFile() + '.tmp', recordsFile());
}

function updateRecord(id: PluginId, update: Partial<PluginRecord>) {
  const records = readRecords();
  records[id] = { ...records[id], ...update };
  writeRecords(records);
}

// ---- Files of each plugin in the CS2 install

const addons = () => path.join(cs2Paths().csgo, 'addons');
const cssPlugins = () => path.join(addons(), 'counterstrikesharp', 'plugins');
// Metamod loads addons/metamod/*.vdf, not the subfolders; CounterStrikeSharp skips plugins/disabled
const cssVdf = () => path.join(addons(), 'metamod', 'counterstrikesharp.vdf');
const cssVdfOff = () => path.join(addons(), 'metamod', 'disabled', 'counterstrikesharp.vdf');

// Where the plugin is when on / off (Metamod is switched in gameinfo.gi instead)
function locations(id: PluginId): { on: string; off: string } | null {
  if (id === 'metamod') return null;
  if (id === 'counterstrikesharp') return { on: cssVdf(), off: cssVdfOff() };
  const folder = def(id).folder!;
  return { on: path.join(cssPlugins(), folder), off: path.join(cssPlugins(), 'disabled', folder) };
}

function isInstalled(id: PluginId) {
  if (id === 'metamod') return fs.existsSync(path.join(addons(), 'metamod', 'bin'));
  if (id === 'counterstrikesharp' && !fs.existsSync(path.join(addons(), 'counterstrikesharp'))) return false;
  const loc = locations(id)!;
  return fs.existsSync(loc.on) || fs.existsSync(loc.off);
}

// The setting, or for a plugin the panel has not touched yet, whether it is installed (an install made by hand keeps working)
export function isEnabled(id: PluginId, records = readRecords()) {
  return records[id]?.enabled ?? isInstalled(id);
}

function move(from: string, to: string) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(from, to);
}

// Steam rewrites gameinfo.gi on every CS2 update, so this runs before each start and after an update
export function syncMetamod() {
  const gameinfo = cs2Paths().gameinfo;
  if (!fs.existsSync(gameinfo)) throw new Error(`Не найден ${gameinfo}: сервер CS2 не установлен?`);
  const content = fs.readFileSync(gameinfo, 'utf8');
  const has = content.includes('csgo/addons/metamod');
  if (isEnabled('metamod')) {
    if (has) return;
    const patched = content.replace(/^(\s*)(Game_LowViolence\s+csgo_lv[^\r\n]*)(\r?\n)/m, '$1$2$3$1Game\tcsgo/addons/metamod$3');
    if (patched === content) throw new Error('Не удалось подключить Metamod: в gameinfo.gi нет строки Game_LowViolence');
    fs.writeFileSync(gameinfo, patched);
  } else if (has) {
    fs.writeFileSync(gameinfo, content.replace(/^[ \t]*Game[ \t]+csgo\/addons\/metamod[^\r\n]*\r?\n/m, ''));
  }
}

function activate(id: PluginId, on: boolean) {
  if (id === 'metamod') return syncMetamod();
  const loc = locations(id)!;
  if (on) move(loc.off, loc.on);
  else move(loc.on, loc.off);
}

// ---- Releases

const UA = { 'User-Agent': 'Matchdesk-panel', Accept: 'application/vnd.github+json' };

async function get(url: string, init?: RequestInit) {
  try {
    return await fetch(url, { cache: 'no-store', ...init });
  } catch {
    throw new Error(`Нет связи с ${new URL(url).host}: проверьте интернет`);
  }
}

async function latestRelease(id: PluginId): Promise<Release> {
  const source = def(id).source;
  if (source.type === 'mms') {
    const base = 'https://mms.alliedmods.net/mmsdrop/2.0/';
    const res = await get(base + 'mmsource-latest-windows');
    if (!res.ok) throw new Error(`Сайт Metamod ответил ${res.status}`);
    const file = (await res.text()).trim();
    if (!/^mmsource-[\w.-]+\.zip$/.test(file)) throw new Error('Сайт Metamod вернул непонятное имя файла');
    const version = /mmsource-([\d.]+-git\d+)/.exec(file)?.[1] ?? file;
    return { version, file, url: base + file, updatedAt: version };
  }
  const res = await get(`https://api.github.com/repos/${source.repo}/releases/latest`, { headers: UA });
  if (res.status === 404) throw new Error(`${source.repo}: на GitHub нет релизов или репозиторий закрыт`);
  if (!res.ok) throw new Error(`${source.repo}: GitHub ответил ${res.status}`);
  const release = await res.json() as { tag_name: string; assets: { name: string; browser_download_url: string; updated_at: string }[] };
  const asset = release.assets.find((a) => source.asset.test(a.name));
  if (!asset) throw new Error(`${source.repo}: в релизе ${release.tag_name} нет zip-архива`);
  return { version: release.tag_name, file: asset.name, url: asset.browser_download_url, updatedAt: asset.updated_at };
}

const isNewer = (rec: PluginRecord | undefined, latest: Release) =>
  !rec?.version || rec.version !== latest.version || rec.updatedAt !== latest.updatedAt;

// ---- Background job (downloads take a while), polled by the settings page

export interface PluginJob {
  running: boolean;
  title: string;
  phase: string;
  ok?: boolean;
  message?: string;
  log: string[];
  finishedAt?: number;
}

const g = globalThis as unknown as { pluginJob?: PluginJob; pluginLatest?: Partial<Record<PluginId, Release | { error: string }>> };
const job = (): PluginJob => (g.pluginJob ??= { running: false, title: '', phase: '', log: [] });
export const pluginJobRunning = () => job().running;

function log(text: string) {
  const s = job();
  s.phase = text;
  s.log.push(text);
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

async function guard() {
  if (pluginJobRunning()) throw new Error('Уже идёт работа с плагинами');
  if (isUpdating()) throw new Error('Идёт обновление CS2: дождитесь его окончания');
  if (await anyCs2Running()) throw new Error('На этом ПК работает cs2.exe. Остановите все серверы (и запущенные батниками тоже) и повторите.');
  if (!fs.existsSync(cs2Paths().exe)) throw new Error('Сервер CS2 не найден: укажите его папку в настройках («Сервер CS2»).');
}

function runJob(title: string, work: () => Promise<string>) {
  g.pluginJob = { running: true, title, phase: 'Начинаю', log: [] };
  work()
    .then((message) => Object.assign(job(), { running: false, ok: true, message, finishedAt: Date.now() }))
    .catch((e) => {
      log(`Ошибка: ${(e as Error).message}`);
      Object.assign(job(), { running: false, ok: false, message: (e as Error).message, finishedAt: Date.now() });
    });
}

// ---- Install from a zip

function run(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 300_000 }, (err, _out, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()));
      else resolve();
    });
  });
}

async function unzip(zip: string, dir: string) {
  // tar of Windows 10+ unpacks zip much faster than Expand-Archive (CounterStrikeSharp has thousands of files)
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  if (fs.existsSync(tar)) return run(tar, ['-xf', zip, '-C', dir]);
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -Force -Path ${q(zip)} -DestinationPath ${q(dir)}`]);
}

// Settings the judges may have changed: kept, only added when missing. Everything else (dll, gamedata, lang) is replaced.
const KEEP = [/^cfg\//i, /^addons\/counterstrikesharp\/configs\//i, /^addons\/metamod\/metaplugins\.ini$/i];

function copyTree(from: string, to: string, rel = '') {
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      count += copyTree(src, dst, relPath);
    } else {
      if (fs.existsSync(dst) && KEEP.some((re) => re.test(relPath))) continue;
      fs.copyFileSync(src, dst);
      count++;
    }
  }
  return count;
}

// The archive root is the folder with addons/ (some archives wrap everything in one more folder)
function archiveRoot(dir: string): string {
  if (fs.existsSync(path.join(dir, 'addons'))) return dir;
  const subdirs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (subdirs.length === 1 && fs.existsSync(path.join(dir, subdirs[0].name, 'addons'))) return path.join(dir, subdirs[0].name);
  throw new Error('В архиве нет папки addons');
}

async function download(id: PluginId, release: Release) {
  const dir = cacheDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, release.file);
  log(`Скачиваю ${release.file}`);
  const res = await get(release.url, { headers: { 'User-Agent': UA['User-Agent'] } });
  if (!res.ok || !res.body) throw new Error(`Не удалось скачать ${release.file}: ${res.status}`);
  fs.writeFileSync(target + '.part', Buffer.from(await res.arrayBuffer()));
  fs.renameSync(target + '.part', target);
  return target;
}

async function installZip(id: PluginId, zip: string) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `matchdesk-${id}-`));
  try {
    log(`Распаковываю ${path.basename(zip)}`);
    await unzip(zip, temp);
    const root = archiveRoot(temp);
    // Into the place it loads from, then off again if it is switched off
    const enabled = isEnabled(id);
    if (id !== 'metamod') activate(id, true);
    log('Копирую файлы в папку CS2');
    const count = copyTree(root, cs2Paths().csgo);
    log(`Скопировано файлов: ${count}`);
    if (id !== 'metamod' && !enabled) activate(id, false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

// Keeps the installed zip and the one before it
function remember(id: PluginId, release: Release, zip: string) {
  const rec = readRecords()[id];
  const previous = rec?.file && rec.version && rec.file !== zip && fs.existsSync(rec.file)
    ? { version: rec.version, updatedAt: rec.updatedAt ?? '', file: rec.file }
    : rec?.previous?.file !== zip ? rec?.previous : undefined;
  updateRecord(id, { version: release.version, updatedAt: release.updatedAt, installedAt: Date.now(), file: zip, previous });
  const keep = new Set([zip, previous?.file].filter(Boolean).map((f) => path.resolve(f!)));
  for (const name of fs.readdirSync(cacheDir(id))) {
    const file = path.resolve(cacheDir(id), name);
    if (!keep.has(file)) fs.rmSync(file, { force: true });
  }
}

async function installLatest(id: PluginId) {
  log(`${def(id).name}: ищу последнюю версию`);
  const release = await latestRelease(id);
  const zip = await download(id, release);
  await installZip(id, zip);
  remember(id, release, zip);
  log(`${def(id).name} ${release.version} установлен`);
}

// ---- What the settings page calls

export function pluginsView() {
  const records = readRecords();
  return {
    plugins: PLUGINS.map((p) => {
      const rec = records[p.id];
      const latest = g.pluginLatest?.[p.id];
      return {
        id: p.id,
        name: p.name,
        requires: p.requires ?? null,
        source: p.source.type === 'mms' ? 'mms.alliedmods.net' : `github.com/${p.source.repo}`,
        installed: isInstalled(p.id),
        enabled: isEnabled(p.id, records),
        version: rec?.version ?? null,
        installedAt: rec?.installedAt ?? null,
        previous: rec?.previous && fs.existsSync(rec.previous.file) ? rec.previous.version : null,
        latest: latest && 'version' in latest ? latest.version : null,
        latestError: latest && 'error' in latest ? latest.error : null,
        updateAvailable: latest && 'version' in latest ? isInstalled(p.id) && isNewer(rec, latest) : false,
      };
    }),
    job: job(),
  };
}

export async function checkUpdates() {
  const result: NonNullable<typeof g.pluginLatest> = {};
  await Promise.all(PLUGINS.map(async (p) => {
    try { result[p.id] = await latestRelease(p.id); } catch (e) { result[p.id] = { error: (e as Error).message }; }
  }));
  g.pluginLatest = result;
}

// Turns plugins on and off; what is turned on and not installed yet is downloaded. A plugin brings what it needs with it.
export async function applyPlugins(wanted: Partial<Record<PluginId, boolean>>) {
  await guard();
  const records = readRecords();
  const next = Object.fromEntries(PLUGINS.map((p) => [p.id, wanted[p.id] ?? isEnabled(p.id, records)])) as Record<PluginId, boolean>;
  for (const p of [...PLUGINS].reverse()) if (next[p.id] && p.requires) next[p.requires] = true;
  const matchzyBefore = isEnabled('matchzy', records);

  runJob('Применение набора плагинов', async () => {
    for (const p of PLUGINS) {
      const was = isEnabled(p.id);
      updateRecord(p.id, { enabled: next[p.id] });
      if (next[p.id] && !isInstalled(p.id)) {
        // Not downloaded: stays off, so the page does not show it as on
        await installLatest(p.id).catch((e) => { updateRecord(p.id, { enabled: was }); throw e; });
      }
      if (isInstalled(p.id) || p.id === 'metamod') activate(p.id, next[p.id]);
      if (was !== next[p.id]) log(`${p.name}: ${next[p.id] ? 'включён' : 'выключен'}`);
    }
    // Servers without MatchZy run in Vanilla mode, and back to MatchZy when it is on again
    if (matchzyBefore !== next.matchzy) {
      for (const s of servers.list()) if (s.managed) servers.update(s.id, { mode: next.matchzy ? undefined : 'vanilla' });
      log(next.matchzy ? 'Серверы панели переключены в режим MatchZy' : 'Серверы панели переключены в режим Vanilla');
    }
    return 'Готово. Изменения подхватятся при следующем запуске серверов.';
  });
}

export async function updatePlugin(id: PluginId) {
  await guard();
  if (!isInstalled(id)) throw new Error(`${def(id).name} не установлен`);
  runJob(`Обновление ${def(id).name}`, async () => {
    await installLatest(id);
    return `${def(id).name} обновлён.`;
  });
}

export async function rollbackPlugin(id: PluginId) {
  await guard();
  const prev = readRecords()[id]?.previous;
  if (!prev || !fs.existsSync(prev.file)) throw new Error('Предыдущей версии нет');
  runJob(`Откат ${def(id).name}`, async () => {
    await installZip(id, prev.file);
    remember(id, { version: prev.version, updatedAt: prev.updatedAt, file: path.basename(prev.file), url: '' }, prev.file);
    return `${def(id).name}: возвращена версия ${prev.version}.`;
  });
}

// Deletes the plugin files (its settings in cfg / configs stay). What needs the plugin must be removed first.
export async function removePlugin(id: PluginId) {
  await guard();
  const installedDependents = dependents(id).filter(isInstalled);
  if (installedDependents.length) throw new Error(`Сначала удалите ${installedDependents.map((d) => def(d).name).join(', ')}`);
  runJob(`Удаление ${def(id).name}`, async () => {
    const a = addons();
    const targets = id === 'metamod'
      ? [path.join(a, 'metamod'), path.join(a, 'metamod.vdf'), path.join(a, 'metamod_x64.vdf')]
      : id === 'counterstrikesharp'
        ? [path.join(a, 'counterstrikesharp'), cssVdf(), cssVdfOff()]
        : [locations(id)!.on, locations(id)!.off];
    for (const t of targets) fs.rmSync(t, { recursive: true, force: true });
    const rec = readRecords();
    rec[id] = { enabled: false };
    writeRecords(rec);
    fs.rmSync(cacheDir(id), { recursive: true, force: true });
    if (id === 'metamod') syncMetamod();
    if (id === 'matchzy') for (const s of servers.list()) if (s.managed) servers.update(s.id, { mode: 'vanilla' });
    return `${def(id).name} удалён с диска.`;
  });
}

export const isPluginId = (v: unknown): v is PluginId => PLUGINS.some((p) => p.id === v);
