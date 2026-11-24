import fs from 'node:fs';
import path from 'node:path';
import { cs2Paths, readSettings } from './panel-settings';

// [Server] prefix of plugin chat messages, one for all plugins
export const DEFAULT_CHAT_PREFIX = 'Server';

export const cleanChatPrefix = (value: string) => value.replace(/[[\]{}"\r\n;]/g, '').trim().slice(0, 32);
export const chatPrefixName = () => readSettings().chatPrefix || DEFAULT_CHAT_PREFIX;
export const matchzyChatPrefix = (name = chatPrefixName()) => `[{LightBlue}${name}{Default}]`;

function setLine(file: string, key: string, line: string) {
  const text = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`^${key}\\s.*$`, 'm');
  const next = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  if (next !== text) fs.writeFileSync(file, next);
}

// read on plugin load: MatchZy config.cfg, WeaponPaints json
export function applyChatPrefix(csgo = cs2Paths().csgo) {
  const name = chatPrefixName();
  const matchzy = path.join(csgo, 'cfg', 'MatchZy', 'config.cfg');
  if (fs.existsSync(matchzy)) setLine(matchzy, 'matchzy_chat_prefix', `matchzy_chat_prefix ${matchzyChatPrefix(name)}`);

  const weaponPaints = path.join(csgo, 'addons', 'counterstrikesharp', 'configs', 'plugins', 'WeaponPaints', 'WeaponPaints.json');
  if (fs.existsSync(weaponPaints)) {
    // CounterStrikeSharp puts a // comment at the top, so edit as text, not JSON.parse
    const text = fs.readFileSync(weaponPaints, 'utf8');
    const value = JSON.stringify(`[{lightblue}${name}{default}]`);
    const re = /"ChatPrefix"\s*:\s*"(?:[^"\\]|\\.)*"/;
    const next = re.test(text) ? text.replace(re, `"ChatPrefix": ${value}`) : text.replace('{', `{\n  "ChatPrefix": ${value},`);
    if (next !== text) fs.writeFileSync(weaponPaints, next);
  }
}
