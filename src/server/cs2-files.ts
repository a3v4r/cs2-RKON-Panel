import fs from 'node:fs';
import path from 'node:path';

// Steam rewrites gameinfo.gi on every CS2 update, so Metamod is checked before each start and after an update
export function ensureMetamod(gameinfo: string) {
  if (!fs.existsSync(gameinfo)) throw new Error(`Не найден ${gameinfo}: сервер CS2 не установлен?`);
  const content = fs.readFileSync(gameinfo, 'utf8');
  if (content.includes('csgo/addons/metamod')) return;
  const patched = content.replace(/^(\s*)(Game_LowViolence\s+csgo_lv[^\r\n]*)(\r?\n)/m, '$1$2$3$1Game\tcsgo/addons/metamod$3');
  if (patched === content) throw new Error('Не удалось подключить Metamod: в gameinfo.gi нет строки Game_LowViolence');
  fs.writeFileSync(gameinfo, patched);
}

// Plugin messages in Russian (MatchZy takes lang/ru.json). CounterStrikeSharp creates core.json only on its
// first start, so it is made from core.example.json when missing. Without CounterStrikeSharp nothing is done.
export function ensureRussian(csgo: string) {
  const dir = path.join(csgo, 'addons', 'counterstrikesharp', 'configs');
  const core = path.join(dir, 'core.json');
  const example = path.join(dir, 'core.example.json');
  if (!fs.existsSync(core)) {
    if (!fs.existsSync(example)) return;
    fs.copyFileSync(example, core);
  }
  const text = fs.readFileSync(core, 'utf8');
  const patched = text.replace(/"ServerLanguage"\s*:\s*"[^"]*"/, '"ServerLanguage": "ru"');
  if (patched !== text) fs.writeFileSync(core, patched);
}
