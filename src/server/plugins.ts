import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dataDir } from './accounts';
import { isUpdating } from './cs2-update';
import { cs2Paths, readSettings } from './panel-settings';
import { weaponPaintsProblem } from './plugin-health';
import { servers } from './store';

// one plugin set per CS2 install; touches files cs2.exe keeps open, so all servers must be stopped

export type PluginId = 'metamod' | 'counterstrikesharp' | 'matchzy' | 'weaponpaints';

type Source = { type: 'mms' } | { type: 'github'; repo: string; asset: RegExp };

interface PluginDef {
  id: PluginId;
  name: string;
  requires?: PluginId;
  folder?: string; // in addons/counterstrikesharp/plugins
  source: Source;
}

export const PLUGINS: PluginDef[] = [
  { id: 'metamod', name: 'Metamod:Source', source: { type: 'mms' } },
  {
    id: 'counterstrikesharp',
    name: 'CounterStrikeSharp',
    requires: 'metamod',
    // with-runtime build: plugins need the .NET CounterStrikeSharp was built with
    source: { type: 'github', repo: 'roflmuffin/CounterStrikeSharp', asset: /^counterstrikesharp-with-runtime-windows-.*\.zip$/i },
  },
  { id: 'matchzy', name: 'MatchZy', requires: 'counterstrikesharp', folder: 'MatchZy', source: { type: 'github', repo: 'a3v4r/MatchZy-Patched', asset: /\.zip$/i } },
  { id: 'weaponpaints', name: 'WeaponPaints', requires: 'counterstrikesharp', folder: 'WeaponPaints', source: { type: 'github', repo: 'a3v4r/cs2-WeaponPaints-sqlite', asset: /\.zip$/i } },
];

const def = (id: PluginId) => PLUGINS.find((p) => p.id === id)!;
const dependents = (id: PluginId) => PLUGINS.filter((p) => p.requires === id).map((p) => p.id);

interface Release {
  version: string;
  file: string;
  url: string;
  updatedAt: string; // forks re-upload under the same tag; the date tells builds apart
}

interface PluginRecord {
  enabled?: boolean;
  version?: string;
  updatedAt?: string;
  installedAt?: number;
  file?: string; // data/plugin-cache/<id>
  previous?: { version: string; updatedAt: string; file: string };
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

const addons = () => path.join(cs2Paths().csgo, 'addons');
const cssPlugins = () => path.join(addons(), 'counterstrikesharp', 'plugins');
// Metamod loads addons/metamod/*.vdf only, not subfolders; CounterStrikeSharp skips plugins/disabled
const cssVdf = () => path.join(addons(), 'metamod', 'counterstrikesharp.vdf');
const cssVdfOff = () => path.join(addons(), 'metamod', 'disabled', 'counterstrikesharp.vdf');

// Metamod is toggled in gameinfo.gi instead
function locations(id: PluginId): { on: string; off: string } | null {
  if (id === 'metamod') return null;
  if (id === 'counterstrikesharp') return { on: cssVdf(), off: cssVdfOff() };
  const folder = def(id).folder!;
  return { on: path.join(cssPlugins(), folder), off: path.join(cssPlugins(), 'disabled', folder) };
}

export function isInstalled(id: PluginId) {
  if (id === 'metamod') return fs.existsSync(path.join(addons(), 'metamod', 'bin'));
  if (id === 'counterstrikesharp' && !fs.existsSync(path.join(addons(), 'counterstrikesharp'))) return false;
  const loc = locations(id)!;
  return fs.existsSync(loc.on) || fs.existsSync(loc.off);
}

// not touched by the panel yet: on if installed, so manual installs keep working
export function isEnabled(id: PluginId, records = readRecords()) {
  return records[id]?.enabled ?? isInstalled(id);
}

// CounterStrikeSharp blocks WeaponPaints' item swaps under FollowCS2ServerGuidelines (configs/core.json, on by default),
// skins then silently do nothing. turned off before each start while WeaponPaints is on
export function syncWeaponPaintsGuidelines() {
  if (!isEnabled('weaponpaints') || !isInstalled('weaponpaints')) return;
  const dir = path.join(addons(), 'counterstrikesharp', 'configs');
  const core = path.join(dir, 'core.json');
  if (!fs.existsSync(core)) {
    // CounterStrikeSharp ships only core.example.json
    const example = path.join(dir, 'core.example.json');
    if (!fs.existsSync(example)) return;
    fs.copyFileSync(example, core);
  }
  const text = fs.readFileSync(core, 'utf8');
  const next = /"FollowCS2ServerGuidelines"\s*:/.test(text)
    ? text.replace(/("FollowCS2ServerGuidelines"\s*:\s*)true/, '$1false')
    : text.replace('{', '{\n    "FollowCS2ServerGuidelines": false,');
  if (next !== text) fs.writeFileSync(core, next);
}

function move(from: string, to: string) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(from, to);
}

// Steam rewrites gameinfo.gi on every CS2 update: run before each start and after an update
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

const UA = { 'User-Agent': 'Matchdesk-panel', Accept: 'application/vnd.github+json' };

async function get(url: string, init?: RequestInit) {
  try {
    return await fetch(url, { cache: 'no-store', ...init });
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    throw new Error(`Нет связи с ${new URL(url).host}: проверьте интернет (${cause?.code ?? cause?.message ?? (e as Error).message})`);
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

// any cs2.exe from the panel's CS2 folder is a server (bat-started too). the game client lives in
// Steam's folder and doesn't lock these files, so a judge can keep playing
export function serverCs2Running(): Promise<boolean> {
  const exe = path.resolve(cs2Paths().exe).toLowerCase();
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='cs2.exe'\" | ForEach-Object { if ($_.ExecutablePath) { $_.ExecutablePath } else { '?' } }"],
    { windowsHide: true, timeout: 20_000 }, (err, out) => {
      if (err) return resolve(true); // can't tell: don't touch the files
      // '?': path unreadable (another user), could be a server
      resolve(out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).some((l) => l === '?' || path.resolve(l).toLowerCase() === exe));
    });
  });
}

async function guard() {
  if (pluginJobRunning()) throw new Error('Уже идёт работа с плагинами');
  if (isUpdating()) throw new Error('Идёт обновление CS2: дождитесь его окончания');
  if (await serverCs2Running()) throw new Error('Работает сервер CS2 из папки панели. Остановите все серверы (и запущенные батниками тоже) и повторите.');
  if (!fs.existsSync(cs2Paths().exe)) throw new Error('Сервер CS2 не найден: укажите его папку в настройках («Сервер CS2»).');
}

function runJob(title: string, work: () => Promise<string>) {
  g.pluginJob = { running: true, title, phase: 'Начинаю', log: [] };
  // skins site holds the WeaponPaints DB open; Windows won't move or delete an open file
  const site = import('./skins-site');
  return site.then((m) => m.pauseSkinsSite())
    .then(work)
    .then((message) => Object.assign(job(), { running: false, ok: true, message, finishedAt: Date.now() }))
    .catch((e) => {
      log(`Ошибка: ${(e as Error).message}`);
      Object.assign(job(), { running: false, ok: false, message: (e as Error).message, finishedAt: Date.now() });
    })
    .finally(() => site.then((m) => m.resumeSkinsSite()).catch(() => {}));
}

function run(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 300_000 }, (err, _out, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()));
      else resolve();
    });
  });
}

export async function unzip(zip: string, dir: string) {
  // Win10+ tar unpacks zip much faster than Expand-Archive (CounterStrikeSharp has thousands of files)
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  if (fs.existsSync(tar)) return run(tar, ['-xf', zip, '-C', dir]);
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -Force -Path ${q(zip)} -DestinationPath ${q(dir)}`]);
}

// judge-editable settings: kept, only added if missing. dll, gamedata, lang get replaced
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

// archive root = folder with addons/ (some zips wrap it in one more folder)
function archiveRoot(dir: string): string {
  if (fs.existsSync(path.join(dir, 'addons'))) return dir;
  const subdirs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (subdirs.length === 1 && fs.existsSync(path.join(dir, subdirs[0].name, 'addons'))) return path.join(dir, subdirs[0].name);
  throw new Error('В архиве нет папки addons');
}

// forks reuse WeaponPaints.zip for every build: version + build time in the name keeps the rollback zip
const cacheName = (release: Release) =>
  `${release.version}_${release.updatedAt}_${release.file}`.replace(/[^\w.-]+/g, '-');

async function download(id: PluginId, release: Release, say: (text: string) => void = log) {
  const dir = cacheDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, cacheName(release));
  if (fs.existsSync(target)) return target;
  say(`Скачиваю ${release.file}`);
  // GitHub file hosts drop connections now and then: retry once
  const res = await get(release.url, { headers: { 'User-Agent': UA['User-Agent'] } })
    .catch(() => get(release.url, { headers: { 'User-Agent': UA['User-Agent'] } }));
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
    // install where it loads from, then disable again if it is off
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

// VC++ x64 runtime for Metamod / CounterStrikeSharp; installing needs admin, Matchdesk.exe offers it on start
export const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
const gv = globalThis as unknown as { vcRedist?: { ok: boolean | null; at: number; checking?: boolean } };

function refreshVcRedist() {
  const v = (gv.vcRedist ??= { ok: null, at: 0 });
  if (v.checking || Date.now() - v.at < 60_000) return;
  v.checking = true;
  execFile('reg', ['query', String.raw`HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64`, '/v', 'Installed'],
    { windowsHide: true, timeout: 10_000 }, (err, out) => {
      Object.assign(v, { ok: !err && /Installed\s+REG_DWORD\s+0x1\b/i.test(out), at: Date.now(), checking: false });
    });
}

export function vcRedistInstalled() {
  refreshVcRedist();
  return gv.vcRedist?.ok ?? null;
}

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
        problem: p.id === 'weaponpaints' && isInstalled(p.id) && isEnabled(p.id, records) ? weaponPaintsProblem() : null,
      };
    }),
    job: job(),
    auto: autoUpdateView(),
    vcRedist: vcRedistInstalled(),
    vcRedistUrl: VC_REDIST_URL,
  };
}

export async function checkUpdates() {
  const result: NonNullable<typeof g.pluginLatest> = {};
  await Promise.all(PLUGINS.map(async (p) => {
    try { result[p.id] = await latestRelease(p.id); } catch (e) { result[p.id] = { error: (e as Error).message }; }
  }));
  g.pluginLatest = result;
}

// enabling a missing plugin downloads it; dependencies get enabled too
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
        // download failed: keep it off
        await installLatest(p.id).catch((e) => { updateRecord(p.id, { enabled: was }); throw e; });
      }
      if (isInstalled(p.id) || p.id === 'metamod') activate(p.id, next[p.id]);
      if (was !== next[p.id]) log(`${p.name}: ${next[p.id] ? 'включён' : 'выключен'}`);
    }
    // servers without MatchZy switch to Vanilla mode, and back when it is on again
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

// settings in cfg / configs stay; dependents must be removed first
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

// auto-update: checks every few hours and downloads in the background, installs only while no
// server of this install runs (now or right before the next start). "pluginAutoUpdate": false turns it off

const AUTO_FIRST_CHECK_MS = 2 * 60_000;
const AUTO_CHECK_MS = 3 * 3600_000;

interface Pending { release: Release; zip: string }
interface AutoState {
  checking: boolean;
  lastCheck?: number;
  message?: string; // last auto-check result
  pending: Partial<Record<PluginId, Pending>>;
}

const ga = globalThis as unknown as { pluginAuto?: AutoState; pluginAutoTimer?: NodeJS.Timeout };
const auto = (): AutoState => (ga.pluginAuto ??= { checking: false, pending: {} });

export const autoUpdateOn = () => readSettings().pluginAutoUpdate !== false;

function pendingUpdates() {
  const records = readRecords();
  const result: [PluginId, Pending][] = [];
  for (const p of PLUGINS) {
    const item = auto().pending[p.id];
    if (item && isInstalled(p.id) && fs.existsSync(item.zip) && isNewer(records[p.id], item.release)) result.push([p.id, item]);
    else delete auto().pending[p.id];
  }
  return result;
}

async function installPending() {
  const done: string[] = [];
  for (const [id, item] of pendingUpdates()) {
    log(`${def(id).name}: ставлю ${item.release.version}`);
    await installZip(id, item.zip);
    remember(id, item.release, item.zip);
    delete auto().pending[id];
    done.push(`${def(id).name} ${item.release.version}`);
  }
  return done;
}

export async function autoCheck() {
  const a = auto();
  if (!autoUpdateOn() || a.checking || pluginJobRunning() || isUpdating()) return;
  a.checking = true;
  try {
    await checkUpdates();
    a.lastCheck = Date.now();
    const records = readRecords();
    const fresh = PLUGINS.filter((p) => {
      const latest = g.pluginLatest?.[p.id];
      return latest && 'version' in latest && isInstalled(p.id) && isNewer(records[p.id], latest);
    });
    if (!fresh.length) {
      a.message = 'Обновлений нет';
      return;
    }
    // not a job, so it never blocks a server start; failed downloads retry on the next check
    const failed: string[] = [];
    for (const p of fresh) {
      const release = g.pluginLatest![p.id] as Release;
      try {
        a.pending[p.id] = { release, zip: await download(p.id, release, () => {}) };
      } catch (e) {
        failed.push(`${p.name}: ${(e as Error).message}`);
      }
    }
    const ready = fresh.filter((p) => a.pending[p.id]);
    const failedText = failed.length ? ` Не скачалось: ${failed.join('; ')}.` : '';
    if (!ready.length) {
      a.message = `Не удалось скачать обновления.${failedText}`;
      return;
    }
    const names = ready.map((p) => `${p.name} ${(g.pluginLatest![p.id] as Release).version}`).join(', ');
    if (await serverCs2Running()) {
      a.message = `Скачано: ${names}. Установится, когда ни один сервер не будет работать (перед следующим запуском).${failedText}`;
      return;
    }
    await runJob('Автообновление плагинов', async () => `Обновлено: ${(await installPending()).join(', ')}`);
    a.message = (job().ok ? `Обновлено: ${names}.` : `Не удалось обновить: ${job().message}.`) + failedText;
  } catch (e) {
    a.message = `Проверка не удалась: ${(e as Error).message}`;
  } finally {
    a.checking = false;
  }
}

export async function installPendingBeforeStart() {
  if (!autoUpdateOn() || pluginJobRunning() || isUpdating() || pendingUpdates().length === 0) return;
  if (await serverCs2Running()) return;
  await runJob('Автообновление плагинов', async () => `Обновлено перед запуском сервера: ${(await installPending()).join(', ')}`);
  auto().message = job().ok ? job().message : `Не удалось обновить: ${job().message}`;
}

export function startPluginAutoUpdate() {
  if (ga.pluginAutoTimer) return;
  setTimeout(() => { autoCheck().catch(() => {}); }, AUTO_FIRST_CHECK_MS);
  ga.pluginAutoTimer = setInterval(() => { autoCheck().catch(() => {}); }, AUTO_CHECK_MS);
}

export function autoUpdateView() {
  const a = auto();
  return {
    enabled: autoUpdateOn(),
    checking: a.checking,
    lastCheck: a.lastCheck ?? null,
    message: a.message ?? null,
    pending: pendingUpdates().map(([id, item]) => `${def(id).name} ${item.release.version}`),
  };
}
