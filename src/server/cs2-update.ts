import { ChildProcess, execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ensureMetamod } from './cs2-files';
import { cs2Paths } from './panel-settings';

// Updates the CS2 dedicated server with steamcmd, as the kit's update.bat did, but from the panel and with progress.
// All CS2 servers on this PC must be stopped: steamcmd replaces files they keep open.

export interface UpdateState {
  running: boolean;
  phase: string;
  progress: number | null; // %, null when steamcmd does not report it
  attempt: number;
  startedAt?: number;
  finishedAt?: number;
  ok?: boolean;
  message?: string;
  log: string[];
}

const ATTEMPTS = 5; // steamcmd often fails the first time right after updating itself
const LOG_LINES = 300;

const g = globalThis as unknown as { cs2Update?: UpdateState; cs2UpdateChild?: ChildProcess | null; cs2UpdateCancel?: boolean };
const state = (): UpdateState => (g.cs2Update ??= { running: false, phase: '', progress: null, attempt: 0, log: [] });

export const updateState = () => state();
export const isUpdating = () => state().running;

function anyCs2Running(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', 'IMAGENAME eq cs2.exe', '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, out) => {
      resolve(!err && /"cs2\.exe"/i.test(out));
    });
  });
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
      // steamcmd ends progress lines with \r as well as \n
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
  const paths = cs2Paths();
  if (!fs.existsSync(paths.steamcmd)) {
    throw new Error(`Не найден ${paths.steamcmd}. steamcmd ставит установщик турнирного комплекта (setup\\install.bat).`);
  }
  if (await anyCs2Running()) {
    throw new Error('На этом ПК работает cs2.exe. Остановите все серверы (и запущенные батниками тоже) и нажмите ещё раз.');
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
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    s.attempt = attempt;
    s.phase = attempt === 1 ? 'Запуск steamcmd' : `Попытка ${attempt} из ${ATTEMPTS}`;
    s.progress = null;
    onLine(`--- steamcmd, попытка ${attempt} из ${ATTEMPTS}`);
    const code = await runSteamcmd(paths.steamcmd, paths.dir);
    if (g.cs2UpdateCancel) return finish(false, 'Обновление отменено. Запустите его снова, чтобы докачать файлы.');
    if (code === 0 && fs.existsSync(paths.exe)) {
      s.phase = 'Подключение Metamod';
      ensureMetamod(paths.gameinfo);
      return finish(true, 'CS2 обновлён. Можно запускать серверы.');
    }
    onLine(`steamcmd завершился с кодом ${code}`);
    if (attempt < ATTEMPTS) await sleep(5000);
  }
  finish(false, 'steamcmd так и не смог обновить сервер CS2. Проверьте интернет и место на диске и запустите обновление ещё раз.');
}

export function cancelUpdate() {
  if (!isUpdating()) return;
  g.cs2UpdateCancel = true;
  const pid = g.cs2UpdateChild?.pid;
  if (pid) execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
}
