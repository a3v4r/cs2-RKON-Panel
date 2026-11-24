'use strict';

// Matchdesk.exe entry (Node SEA, see scripts/build-exe.mjs). Built-in modules only.
// no args: unpack app\, run the panel, restart on crash
// --run-script <file>: run a script of the unpacked app
// --firewall: add firewall rules (run elevated)

const sea = require('node:sea');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { createRequire } = require('node:module');
const { execFileSync, spawn, spawnSync } = require('node:child_process');

const EXE = process.execPath;
const ROOT = path.dirname(EXE);
const APP = path.join(ROOT, 'app');
const DATA = path.join(ROOT, 'data');
const INI = path.join(ROOT, 'matchdesk.ini');
const SYSTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const VC_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
const RULE_APP = 'Matchdesk';
const RULE_CS2 = 'Matchdesk CS2 Server';

const color = (code) => (text) => `\x1b[${code}m${text}\x1b[0m`;
const cyan = color(36);
const green = color(32);
const yellow = color(33);
const red = color(31);
const step = (text) => console.log(`\n${cyan(`==> ${text}`)}`);
const ok = (text) => console.log(green(`    ${text}`));
const warn = (text) => console.log(yellow(`    ${text}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(text) {
  console.log(`\n${red(`ОШИБКА: ${text}`)}`);
  return pause().then(() => process.exit(1));
}

// keep the console open so the error can be read
function pause() {
  return ask('Нажмите Enter, чтобы закрыть окно.', 0, '');
}

// seconds = 0: no timeout
function ask(question, seconds, fallback) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let timer;
    const done = (answer) => {
      clearTimeout(timer);
      rl.close();
      resolve(answer);
    };
    if (seconds > 0) timer = setTimeout(() => { process.stdout.write('\n'); done(fallback); }, seconds * 1000);
    rl.question(`    ${question} `, (answer) => done(answer.trim() || fallback));
  });
}
const yes = (answer) => /^(y|д|да|yes)?$/i.test(answer.trim());

function runScript(file) {
  // hide node:sqlite ExperimentalWarning (skins site)
  const emit = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type;
    if (type === 'ExperimentalWarning' || warning?.name === 'ExperimentalWarning') return;
    return emit.call(process, warning, ...rest);
  };
  const load = createRequire(file);
  if (file.endsWith('.mjs')) {
    // SEA entry can't import() ESM; matchdesk-run.cjs (from build-exe.mjs) does
    return load(path.join(APP, 'matchdesk-run.cjs'))(file);
  }
  return load(file);
}

function ensureApp() {
  const build = sea.getAsset('build.txt', 'utf8').trim();
  const marker = path.join(APP, '.build');
  let current = '';
  try {
    current = fs.readFileSync(marker, 'utf8').trim();
  } catch {
    // first start
  }
  if (current === build && fs.existsSync(path.join(APP, 'server.js'))) return;

  step(current ? `Обновляю панель (${build})` : `Распаковываю панель (${build})`);
  for (let attempt = 1; fs.existsSync(APP); attempt++) {
    try {
      fs.rmSync(APP, { recursive: true, force: true });
    } catch (e) {
      if (attempt >= 5) throw new Error(`Не удалось удалить старую папку ${APP}: ${e.message}. Закройте другие окна Matchdesk и запустите снова.`);
      spawnSync(path.join(SYSTEM32, 'timeout.exe'), ['/T', '2', '/NOBREAK'], { stdio: 'ignore' });
    }
  }
  const zip = path.join(os.tmpdir(), `matchdesk-${process.pid}.zip`);
  fs.writeFileSync(zip, Buffer.from(sea.getAsset('app.zip')));
  try {
    fs.mkdirSync(APP, { recursive: true });
    execFileSync(path.join(SYSTEM32, 'tar.exe'), ['-xf', zip, '-C', APP], { stdio: 'ignore', windowsHide: true });
  } finally {
    fs.rmSync(zip, { force: true });
  }
  fs.writeFileSync(marker, build);
  ok('Готово');
}

const INI_TEMPLATE = [
  '# Настройки запуска Matchdesk. Формат: КЛЮЧ=значение, строки с # - комментарии.',
  '',
  '# Порт панели в браузере',
  'PORT=3000',
  '',
  '# Пароль аккаунта admin. Пусто - сгенерируется при запуске и запишется сюда.',
  '# Остальные аккаунты добавляются в панели, в разделе «Пользователи».',
  'PANEL_PASSWORD=',
  '',
];

function readIni() {
  if (!fs.existsSync(INI)) fs.writeFileSync(INI, INI_TEMPLATE.join('\r\n'));
  const lines = fs.readFileSync(INI, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) values[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  const set = (key, value) => {
    let found = false;
    const next = lines.map((l) => (new RegExp(`^\\s*${key}\\s*=`).test(l) ? ((found = true), `${key}=${value}`) : l));
    if (!found) next.push(`${key}=${value}`);
    fs.writeFileSync(INI, next.join('\r\n'));
    lines.splice(0, lines.length, ...next);
    values[key] = value;
  };
  return { values, set };
}

function password() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(8), (b) => chars[b % chars.length]).join('');
}

function vcInstalled() {
  const r = spawnSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64', '/v', 'Installed'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 && /Installed\s+REG_DWORD\s+0x1\b/i.test(r.stdout);
}

// UAC prompt; exit code, or null if cancelled
function runElevated(file, args) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const argList = args.length ? ` -ArgumentList ${args.map(q).join(',')}` : '';
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `try { (Start-Process -FilePath ${q(file)}${argList} -Verb RunAs -Wait -PassThru).ExitCode } catch { 'cancelled' }`],
  { encoding: 'utf8', windowsHide: true });
  const out = (r.stdout || '').trim();
  return out === 'cancelled' ? null : Number(out);
}

async function offerVcRuntime() {
  if (vcInstalled()) return;
  step('Visual C++ Redistributable x64');
  warn('Не установлен: без него плагины сервера CS2 (Metamod, CounterStrikeSharp) не загрузятся.');
  if (!yes(await ask('Установить сейчас? [Д/н] (сам через 15 секунд)', 15, 'д'))) return;
  try {
    const file = path.join(os.tmpdir(), 'vc_redist.x64.exe');
    const res = await fetch(VC_URL, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`сервер ответил ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log('    Устанавливаю (Windows спросит разрешение администратора)...');
    const code = runElevated(file, ['/install', '/quiet', '/norestart']);
    if (code === null) warn('Установку отменили.');
    else if ([0, 1638, 3010].includes(code)) ok('Установлен');
    else warn(`Установщик завершился с кодом ${code}`);
  } catch (e) {
    warn(`Не получилось: ${e.message}. Скачайте и установите вручную: ${VC_URL}`);
  }
}

function cs2Exe() {
  let dir = 'C:\\cs2server\\cs2';
  try {
    const s = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8').replace(/^\uFEFF/, ''));
    if (s.cs2Dir) dir = s.cs2Dir;
  } catch {
    // no settings yet
  }
  return path.join(dir, 'game', 'bin', 'win64', 'cs2.exe');
}

// name alone is not enough: must allow this exact program path
function ruleOk(name, program) {
  const r = spawnSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`, 'verbose'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 && r.stdout.toLowerCase().includes(program.toLowerCase());
}

function firewallMissing() {
  const missing = [];
  if (!ruleOk(RULE_APP, EXE)) missing.push(RULE_APP);
  const cs2 = cs2Exe();
  if (fs.existsSync(cs2) && !ruleOk(RULE_CS2, cs2)) missing.push(RULE_CS2);
  return missing;
}

function addRule(name, program) {
  spawnSync('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`], { stdio: 'ignore', windowsHide: true });
  const r = spawnSync('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=${name}`, 'dir=in', 'action=allow', `program=${program}`, 'enable=yes', 'profile=any'], { stdio: 'ignore', windowsHide: true });
  return r.status === 0;
}

async function firewallMode() {
  process.title = 'Matchdesk - брандмауэр';
  step(`Правило для ${EXE}`);
  if (addRule(RULE_APP, EXE)) ok('Панель и сайт скинов доступны из локальной сети');
  else warn('netsh не смог добавить правило');
  const cs2 = cs2Exe();
  step(`Правило для ${cs2}`);
  if (!fs.existsSync(cs2)) warn('CS2 ещё не установлен: после установки нажмите «Брандмауэр» в окне установки CS2 или перезапустите Matchdesk.exe.');
  else if (addRule(RULE_CS2, cs2)) ok('Входящие подключения к серверам CS2 разрешены');
  else warn('netsh не смог добавить правило');
  await sleep(3000);
}

async function offerFirewall() {
  const missing = firewallMissing();
  if (!missing.length) return;
  step('Брандмауэр Windows');
  warn(`Нет правил: ${missing.join(', ')}. Без них панель, сайт скинов и серверы не будут доступны с других ПК.`);
  if (!yes(await ask('Добавить сейчас? [Д/н] (сам через 15 секунд)', 15, 'д'))) return;
  console.log('    Windows спросит разрешение администратора...');
  const code = runElevated(EXE, ['--firewall']);
  if (code === null) warn('Отменено. Правила можно добавить позже: «Серверы» -> окно установки CS2 -> «Брандмауэр».');
  else if (!firewallMissing().length) ok('Правила добавлены');
}

function addresses(port) {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .map((a) => a.address);
  return [`http://localhost:${port}      (на этом ПК)`, ...ips.map((ip) => `http://${ip}:${port}`)];
}

async function main() {
  process.title = 'Matchdesk';
  ensureApp();

  const ini = readIni();
  if (!ini.values.PANEL_PASSWORD) {
    ini.set('PANEL_PASSWORD', password());
    ok('Пароль admin сгенерирован и записан в matchdesk.ini');
  }
  const port = ini.values.PORT || '3000';

  await offerVcRuntime();
  await offerFirewall();

  process.title = `Matchdesk - порт ${port}`;
  console.log(`\n${cyan('Matchdesk. Открыть в браузере (телефон должен быть в той же сети, что и этот ПК):')}`);
  for (const a of addresses(port)) console.log(green(`    ${a}`));
  console.log(green(`    Логин admin, пароль ${ini.values.PANEL_PASSWORD}`));
  console.log('\nПервый запуск: «Серверы» -> «Установить CS2», затем «Настройки -> Плагины». Ещё аккаунты - в разделе «Пользователи».');
  console.log('Это окно не закрывайте: закрытие останавливает панель (серверы CS2 продолжат работать).\n');

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    HOSTNAME: '0.0.0.0',
    PANEL_PASSWORD: ini.values.PANEL_PASSWORD,
    PANEL_DATA_DIR: DATA,
    MATCHDESK_EXE: '1',
  };

  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  for (;;) {
    const child = spawn(EXE, ['--run-script', path.join(APP, 'server.js')], { cwd: APP, env, stdio: 'inherit' });
    const code = await new Promise((resolve) => child.on('exit', (c) => resolve(c)));
    if (stopping) process.exit(0);
    warn(`[${new Date().toLocaleTimeString('ru-RU')}] Панель остановилась (код ${code}). Перезапуск через 5 секунд, Ctrl+C - выйти.`);
    await sleep(5000);
    if (stopping) process.exit(0);
  }
}

const args = process.argv.slice(2);
if (args[0] === '--run-script' && args[1]) {
  runScript(path.resolve(args[1]));
} else if (args[0] === '--firewall') {
  firewallMode().then(() => process.exit(0));
} else {
  main().catch((e) => fail(e.message));
}
