import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { cs2Paths } from './panel-settings';

// Windows firewall rules for Matchdesk.exe (the panel and the skins site) and the panel's cs2.exe.
// Matchdesk.exe adds them itself when started with --firewall as administrator (launcher/main.cjs);
// here the panel only checks them and starts that, so Windows asks for permission on this PC.

const RULE_APP = 'Matchdesk';
const RULE_CS2 = 'Matchdesk CS2 Server';

// Run as Matchdesk.exe (not plain node / npm run dev)
export const isExe = () => process.env.MATCHDESK_EXE === '1';

function run(file: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 120_000 }, (err, out) => {
      resolve({ code: err ? Number((err as NodeJS.ErrnoException & { code?: unknown }).code) || 1 : 0, out: String(out) });
    });
  });
}

// A rule with this name that allows exactly this program
async function ruleOk(name: string, program: string) {
  const r = await run('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`, 'verbose']);
  return r.code === 0 && r.out.toLowerCase().includes(program.toLowerCase());
}

// The install window asks every second: netsh at most every 10 seconds
const g = globalThis as unknown as { firewallCache?: { at: number; view: { app: boolean; cs2: boolean | null } } };

export async function firewallView() {
  if (!isExe()) return null;
  if (g.firewallCache && Date.now() - g.firewallCache.at < 10_000) return g.firewallCache.view;
  const cs2 = cs2Paths().exe;
  const cs2Installed = fs.existsSync(cs2);
  const [app, server] = await Promise.all([ruleOk(RULE_APP, process.execPath), cs2Installed ? ruleOk(RULE_CS2, cs2) : Promise.resolve(false)]);
  const view = { app, cs2: cs2Installed ? server : null };
  g.firewallCache = { at: Date.now(), view };
  return view;
}

export async function openFirewall() {
  if (!isExe()) throw new Error('Правила брандмауэра добавляет Matchdesk.exe: панель запущена не из него.');
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `try { (Start-Process -FilePath ${q(process.execPath)} -ArgumentList '--firewall' -Verb RunAs -Wait -PassThru).ExitCode } catch { 'cancelled' }`]);
  g.firewallCache = undefined;
  if (r.out.trim() === 'cancelled') throw new Error('На этом ПК отказали в правах администратора.');
}
