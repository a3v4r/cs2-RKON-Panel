import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureMetamod, ensureRussian } from './cs2-files';
import { cs2Paths } from './panel-settings';

// "System Health" of the Quatrix settings, for a Windows tournament PC: hardware, and whether the
// CS2 server is installed with what the tournament needs (Metamod, CounterStrikeSharp, MatchZy).

const GB = 1024 ** 3;

function diskFree(dir: string) {
  // statfs needs an existing path: walk up to the drive root if the CS2 folder is not there yet
  let target = dir;
  while (!fs.existsSync(target) && path.dirname(target) !== target) target = path.dirname(target);
  try {
    const st = fs.statfsSync(target);
    return { free: st.bavail * st.bsize, total: st.blocks * st.bsize };
  } catch {
    return { free: 0, total: 0 };
  }
}

export function systemHealth() {
  const p = cs2Paths();
  const css = path.join(p.csgo, 'addons', 'counterstrikesharp');
  const gameinfo = fs.existsSync(p.gameinfo) ? fs.readFileSync(p.gameinfo, 'utf8') : '';
  const disk = diskFree(p.dir);
  const ram = os.totalmem();
  const checks = {
    cs2: fs.existsSync(p.exe),
    steamcmd: fs.existsSync(p.steamcmd),
    metamod: fs.existsSync(path.join(p.csgo, 'addons', 'metamod')),
    metamodInGameinfo: gameinfo.includes('csgo/addons/metamod'),
    counterstrikesharp: fs.existsSync(css),
    matchzy: fs.existsSync(path.join(css, 'plugins', 'MatchZy')),
  };
  return {
    runtime: {
      node: process.version,
      panel: process.env.NEXT_PUBLIC_PANEL_VERSION ?? '',
      os: `${os.type()} ${os.release()} (${os.arch()})`,
    },
    cpu: { model: os.cpus()[0]?.model.trim() ?? '', cores: os.cpus().length },
    ram: { total: ram, status: ram >= 8 * GB ? 'good' : 'low' },
    disk: { ...disk, status: disk.free >= 40 * GB ? 'good' : 'low' },
    paths: { cs2: p.dir, steamcmd: p.steamcmd },
    checks,
    // What Repair can fix by itself (the rest needs the kit installer)
    repairable: checks.cs2 && checks.metamod && !checks.metamodInGameinfo,
  };
}

export function repairSystem() {
  const p = cs2Paths();
  ensureMetamod(p.gameinfo);
  ensureRussian(p.csgo);
}

// Download steamcmd.zip from Valve and unpack it next to the path set for steamcmd.exe
export function downloadSteamcmd(): Promise<string> {
  const target = cs2Paths().steamcmd;
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'steamcmd.zip');
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const command = [
    "$ProgressPreference = 'SilentlyContinue'",
    `Invoke-WebRequest -UseBasicParsing -Uri 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' -OutFile ${q(zip)}`,
    `Expand-Archive -Force -Path ${q(zip)} -DestinationPath ${q(dir)}`,
    `Remove-Item ${q(zip)}`,
  ].join('; ');
  return new Promise((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 180_000 }, (err, _out, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim() || 'Не удалось скачать SteamCMD'));
      else if (!fs.existsSync(target)) reject(new Error(`steamcmd.exe не появился в ${dir}`));
      else resolve(target);
    });
  });
}
