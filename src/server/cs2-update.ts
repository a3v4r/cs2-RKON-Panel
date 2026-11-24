import { ChildProcess, execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pluginJobRunning, serverCs2Running, syncMetamod, unzip } from './plugins';
import { cs2Paths } from './panel-settings';

// all servers must be stopped: steamcmd replaces files they keep open

export interface UpdateState {
  running: boolean;
  phase: string;
  progress: number | null; // %, null when steamcmd doesn't report it
  attempt: number;
  startedAt?: number;
  finishedAt?: number;
  ok?: boolean;
  message?: string;
  log: string[];
}

const ATTEMPTS = 5; // steamcmd often fails right after updating itself
const STEAMCMD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
const FREE_GB_FOR_INSTALL = 85; // ~60 GB server + room for the download
const LOG_LINES = 300;

const g = globalThis as unknown as { cs2Update?: UpdateState; cs2UpdateChild?: ChildProcess | null; cs2UpdateCancel?: boolean };
const state = (): UpdateState => (g.cs2Update ??= { running: false, phase: '', progress: null, attempt: 0, log: [] });

export const updateState = () => state();
export const isUpdating = () => state().running;

function freeGb(dir: string) {
  let probe = path.resolve(dir);
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  try {
    const st = fs.statfsSync(probe);
    return (st.bavail * st.bsize) / 1024 ** 3;
  } catch {
    return null;
  }
}

async function downloadSteamcmd(steamcmd: string) {
  const dir = path.dirname(steamcmd);
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'steamcmd.zip');
  onLine(`Скачиваю steamcmd: ${STEAMCMD_URL}`);
  const res = await fetch(STEAMCMD_URL, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Не удалось скачать steamcmd: сервер Valve ответил ${res.status}`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  await unzip(zip, dir);
  fs.rmSync(zip, { force: true });
  if (!fs.existsSync(steamcmd)) throw new Error(`В архиве steamcmd нет ${path.basename(steamcmd)}`);
  onLine(`steamcmd распакован в ${dir}`);
}

const PHASES: Record<string, string> = {
  downloading: 'Загрузка',
  verifying: 'Проверка файлов',
  preallocating: 'Подготовка места на диске',
  committing: 'Установка файлов',
  reconfiguring: 'Настройка',
};

function onLine(line: string) {
  const s = state();
  const text = line.trim();
  if (!text) return;
  s.log.push(text);
  if (s.log.length > LOG_LINES) s.log.splice(0, s.log.length - LOG_LINES);
  // " Update state (0x61) downloading, progress: 42.17 (12345 / 67890)"
  const m = /Update state \(0x[0-9a-f]+\) ([a-z ]+), progress: ([\d.]+)/i.exec(text);
  if (m) {
    const word = m[1].trim().split(' ')[0].toLowerCase();
    s.phase = PHASES[word] ?? m[1].trim();
    s.progress = Math.min(100, Number(m[2]));
  } else if (/Checking for available update|Downloading update|Verifying installation/i.test(text)) {
    s.phase = 'Обновление самого steamcmd';
    s.progress = null;
  } else if (/Logging in user|Waiting for user info/i.test(text)) {
    s.phase = 'Вход в Steam';
  }
}

function runSteamcmd(steamcmd: string, gameDir: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(steamcmd, ['+force_install_dir', gameDir, '+login', 'anonymous', '+app_update', '730', 'validate', '+quit'], {
      cwd: path.dirname(steamcmd),
      windowsHide: true,
    });
    g.cs2UpdateChild = child;
    let rest = '';
    const feed = (chunk: Buffer) => {
      // progress lines end with \r too
      const parts = (rest + chunk.toString('utf8')).split(/\r?\n|\r/);
      rest = parts.pop() ?? '';
      parts.forEach(onLine);
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', (e) => { onLine(`Ошибка запуска steamcmd: ${e.message}`); resolve(null); });
    child.on('close', (code) => { if (rest) onLine(rest); g.cs2UpdateChild = null; resolve(code); });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startUpdate() {
  if (isUpdating()) throw new Error('Обновление уже идёт');
  if (pluginJobRunning()) throw new Error('Идёт установка плагинов: дождитесь её окончания');
  const paths = cs2Paths();
  if (!fs.existsSync(paths.exe)) {
    const free = freeGb(paths.dir);
    if (free !== null && free < FREE_GB_FOR_INSTALL) {
      throw new Error(`Для установки CS2 нужно минимум ${FREE_GB_FOR_INSTALL} ГБ, на диске с папкой ${paths.dir} свободно ${Math.floor(free)} ГБ. Освободите место или выберите другую папку в настройках («Сервер CS2»).`);
    }
  }
  // only the panel's CS2 folder; a game client doesn't lock these files
  if (await serverCs2Running()) {
    throw new Error('Работает сервер CS2 из папки панели. Остановите все серверы (и запущенные батниками тоже) и нажмите ещё раз.');
  }
  g.cs2Update = { running: true, phase: 'Запуск steamcmd', progress: null, attempt: 0, startedAt: Date.now(), log: [] };
  g.cs2UpdateCancel = false;
  run(paths).catch((e) => finish(false, (e as Error).message));
}

function finish(ok: boolean, message: string) {
  const s = state();
  s.running = false;
  s.ok = ok;
  s.message = message;
  s.finishedAt = Date.now();
  if (ok) s.progress = 100;
}

async function run(paths: ReturnType<typeof cs2Paths>) {
  const s = state();
  const fresh = !fs.existsSync(paths.exe);
  if (!fs.existsSync(paths.steamcmd)) {
    s.phase = 'Скачиваю steamcmd';
    await downloadSteamcmd(paths.steamcmd);
  }
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    s.attempt = attempt;
    s.phase = attempt === 1 ? 'Запуск steamcmd' : `Попытка ${attempt} из ${ATTEMPTS}`;
    s.progress = null;
    onLine(`--- steamcmd, попытка ${attempt} из ${ATTEMPTS}`);
    const code = await runSteamcmd(paths.steamcmd, paths.dir);
    if (g.cs2UpdateCancel) return finish(false, 'Обновление отменено. Запустите его снова, чтобы докачать файлы.');
    if (code === 0 && fs.existsSync(paths.exe)) {
      s.phase = 'Подключение Metamod';
      syncMetamod();
      return finish(true, fresh
        ? 'CS2 установлен. Дальше: разрешите его в брандмауэре (строка «Брандмауэр» выше) и включите плагины («Настройки → Плагины»).'
        : 'CS2 обновлён. Можно запускать серверы.');
    }
    onLine(`steamcmd завершился с кодом ${code}`);
    if (attempt < ATTEMPTS) await sleep(5000);
  }
  finish(false, `steamcmd так и не смог ${fresh ? 'установить' : 'обновить'} сервер CS2. Проверьте интернет и место на диске и запустите ещё раз: скачанное сохранится.`);
}

export function cancelUpdate() {
  if (!isUpdating()) return;
  g.cs2UpdateCancel = true;
  const pid = g.cs2UpdateChild?.pid;
  if (pid) execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
}
