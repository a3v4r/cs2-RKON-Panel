import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { localImage, imageName } from './images.mjs';

// Item lists the plugin itself uses (its data folder), in the configured language
// Every picture is fetched in advance (~1.4 GB with 9 600+ stickers), stickers last
const prefetch = new Set();

// Music ("Valve — CS:GO") and a few stickers use long dashes: shown as a plain hyphen
const NAME_FIELDS = ['name', 'paint_name', 'agent_name'];
const plainDashes = (text) => text.replace(/\s*[–—]\s*/g, ' - ');

function load(kind) {
  for (const lang of [config.language, 'en']) {
    const file = path.join(config.dataDir, `${kind}_${lang}.json`);
    if (!fs.existsSync(file)) continue;
    const items = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const item of items) {
      for (const field of NAME_FIELDS) if (typeof item[field] === 'string') item[field] = plainDashes(item[field]);
      if (!item.image) continue;
      item.image = localImage(item.image);
      const name = imageName(item.image);
      if (name) prefetch.add(name);
    }
    return items;
  }
  console.warn(`Нет файла ${kind}_${config.language}.json в ${config.dataDir}`);
  return [];
}

const CATEGORY = {
  pistols: ['weapon_glock', 'weapon_usp_silencer', 'weapon_hkp2000', 'weapon_p250', 'weapon_elite', 'weapon_fiveseven',
    'weapon_tec9', 'weapon_cz75a', 'weapon_deagle', 'weapon_revolver', 'weapon_taser'],
  smg: ['weapon_mac10', 'weapon_mp9', 'weapon_mp7', 'weapon_mp5sd', 'weapon_ump45', 'weapon_p90', 'weapon_bizon'],
  rifles: ['weapon_galilar', 'weapon_famas', 'weapon_ak47', 'weapon_m4a1', 'weapon_m4a1_silencer', 'weapon_sg556',
    'weapon_aug', 'weapon_ssg08', 'weapon_awp', 'weapon_g3sg1', 'weapon_scar20'],
  heavy: ['weapon_nova', 'weapon_xm1014', 'weapon_mag7', 'weapon_sawedoff', 'weapon_m249', 'weapon_negev'],
};
const categoryOf = new Map(Object.entries(CATEGORY).flatMap(([cat, list]) => list.map((c) => [c, cat])));
const order = new Map(Object.values(CATEGORY).flat().map((c, i) => [c, i]));

const isKnife = (cls) => cls.startsWith('weapon_knife') || cls === 'weapon_bayonet';

// "★ Karambit | Doppler" -> ["Karambit", "Doppler"]
function splitName(paintName) {
  const clean = String(paintName).replace(/^★\s*/, '');
  const bar = clean.indexOf('|');
  return bar < 0 ? [clean.trim(), ''] : [clean.slice(0, bar).trim(), clean.slice(bar + 1).trim()];
}

function build() {
  const weapons = new Map();
  const skins = {};

  for (const s of load('skins')) {
    const defindex = Number(s.weapon_defindex);
    const cls = String(s.weapon_name);
    const paint = Number(s.paint);
    const knife = isKnife(cls);
    if (!knife && !categoryOf.has(cls)) continue;
    const [weaponName, skinName] = splitName(s.paint_name);

    if (!weapons.has(defindex)) {
      weapons.set(defindex, { defindex, class: cls, name: weaponName, category: knife ? 'knives' : categoryOf.get(cls), image: '' });
    }
    if (paint === 0) {
      Object.assign(weapons.get(defindex), { name: weaponName, image: s.image ?? '' });
      continue;
    }
    (skins[defindex] ??= []).push({ paint, name: skinName || weaponName, image: s.image ?? '', legacy: s.legacy_model === true });
  }
  for (const list of Object.values(skins)) list.sort((a, b) => a.name.localeCompare(b.name, config.language));

  const sortedWeapons = [...weapons.values()].sort((a, b) =>
    a.category === 'knives' && b.category === 'knives' ? a.name.localeCompare(b.name, config.language) : (order.get(a.class) ?? 999) - (order.get(b.class) ?? 999));

  const gloves = load('gloves')
    .filter((g) => Number(g.weapon_defindex) !== 0)
    .map((g) => {
      const [type, name] = splitName(g.paint_name);
      return { defindex: Number(g.weapon_defindex), paint: Number(g.paint), type, name: name || type, image: g.image ?? '' };
    })
    .sort((a, b) => a.type.localeCompare(b.type, config.language) || a.name.localeCompare(b.name, config.language));

  const simple = (kind) => load(kind).map((x) => ({ id: Number(x.id), name: String(x.name), image: x.image ?? '' }));

  const agents = load('agents')
    .filter((a) => a.model && a.model !== 'null')
    .map((a) => ({ team: Number(a.team), model: String(a.model), name: String(a.agent_name), image: a.image ?? '' }));

  return {
    weapons: sortedWeapons,
    skins,
    gloves,
    music: simple('music'),
    pins: simple('collectibles'),
    keychains: simple('keychains'),
    agents,
  };
}

export const catalog = build();

// Fast checks for incoming saves
export const weaponByDefindex = new Map(catalog.weapons.map((w) => [w.defindex, w]));
export const knifeClasses = new Set(catalog.weapons.filter((w) => w.category === 'knives').map((w) => w.class));
export const paintsByDefindex = new Map(Object.entries(catalog.skins).map(([d, list]) => [Number(d), new Set(list.map((s) => s.paint))]));
export const gloveKeys = new Set(catalog.gloves.map((g) => `${g.defindex}:${g.paint}`));
export const musicIds = new Set(catalog.music.map((m) => m.id));
export const pinIds = new Set(catalog.pins.map((p) => p.id));
export const keychainIds = new Set(catalog.keychains.map((k) => k.id));
export const agentModels = new Map(catalog.agents.map((a) => [a.model, a.team]));

// 9 600+ stickers: searched on the server, not sent to the page whole
const stickers = load('stickers').map((s) => ({ id: Number(s.id), name: String(s.name), image: s.image ?? '' }));
const stickerById = new Map(stickers.map((s) => [s.id, s]));
const stickerSearch = stickers.map((s) => s.name.toLowerCase());

export function findStickers(query, limit = 60) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = [];
  for (let i = 0; i < stickers.length && found.length < limit; i++) {
    if (words.every((w) => stickerSearch[i].includes(w))) found.push(stickers[i]);
  }
  return found;
}

export const stickerInfo = (id) => stickerById.get(id) ?? null;

export const prefetchList = () => [...prefetch];
