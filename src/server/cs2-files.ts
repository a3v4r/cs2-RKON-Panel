import fs from 'node:fs';
import path from 'node:path';

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
