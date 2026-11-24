import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { config, root } from './lib/config.mjs';
import { readSession, sessionCookie, clearCookie } from './lib/session.mjs';
import { steamProfile } from './lib/steam.mjs';
import { rconCommand } from './lib/rcon.mjs';
import * as db from './lib/db.mjs';
import {
  catalog, weaponByDefindex, knifeClasses, paintsByDefindex, gloveKeys, musicIds, pinIds, keychainIds, agentModels,
  findStickers, stickerInfo, prefetchList,
} from './lib/catalog.mjs';
import { getImage, prefetchImages } from './lib/images.mjs';

const PUBLIC_DIR = path.join(root, 'public');
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; img-src 'self' data: https://*.steamstatic.com; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(req, res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  let data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const headers = { ...SECURITY_HEADERS, 'content-type': type, 'cache-control': 'no-store', ...extra };
  if (Buffer.byteLength(data) > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    data = zlib.gzipSync(data);
    headers['content-encoding'] = 'gzip';
  }
  res.writeHead(status, headers);
  res.end(data);
}

function redirect(res, location, cookie) {
  const headers = { ...SECURITY_HEADERS, location };
  if (cookie) headers['set-cookie'] = cookie;
  res.writeHead(302, headers);
  res.end();
}

async function readJson(req) {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Нужен JSON');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new HttpError(413, 'Слишком большой запрос');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Неверный JSON');
  }
}

// ---- input checks -------------------------------------------------------

function teamsOf(body) {
  const teams = Array.isArray(body.teams) ? [...new Set(body.teams.map(Number))] : [];
  if (teams.length === 0 || teams.some((t) => t !== 2 && t !== 3)) throw new HttpError(400, 'Выберите сторону: T, CT или обе');
  return teams;
}

const int = (v, min, max, name) => {
  const n = Number(v ?? 0);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Неверное значение: ${name}`);
  return n;
};

function wearOf(v) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new HttpError(400, 'Износ должен быть от 0 до 1');
  return Math.round(n * 1e6) / 1e6;
}

function nametagOf(v) {
  const text = String(v ?? '').replace(/[\x00-\x1F\x7F]/g, '').trim();
  if ([...text].length > 20) throw new HttpError(400, 'Нейм-тег длиннее 20 символов');
  return text;
}

// ---- RCON: give the player his new items right away ---------------------

async function applyInGame(steamId) {
  const list = config.servers;
  const results = await Promise.allSettled(list.map((s) =>
    rconCommand(s.host, Number(s.port), s.rconPassword ?? '', `css_wp_reload ${steamId}`)));
  let online = false;
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') online ||= r.value.includes(`${steamId}: ok`);
    else console.warn(`[${list[i].name ?? list[i].host}] ${r.reason.message}`);
  }
  return online;
}

async function afterSave(steamId) {
  return { loadout: loadoutFor(steamId), applied: await applyInGame(steamId) };
}

function loadoutFor(steamId) {
  const loadout = db.getLoadout(steamId);
  const ids = new Set(loadout.skins.flatMap((s) => s.stickers).filter(Boolean));
  loadout.stickerInfo = Object.fromEntries([...ids].map((id) => [id, stickerInfo(id)]).filter(([, v]) => v));
  return loadout;
}

// ---- routes -------------------------------------------------------------

const catalogJson = JSON.stringify(catalog);

async function api(req, res, url, steamId) {
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/me') {
    const profile = await steamProfile(steamId);
    return send(req, res, 200, { steamId, ...profile, servers: config.servers.length });
  }
  if (route === 'GET /api/catalog') return send(req, res, 200, catalogJson);
  if (route === 'GET /api/loadout') return send(req, res, 200, loadoutFor(steamId));
  if (route === 'GET /api/stickers') {
    const q = (url.searchParams.get('q') ?? '').slice(0, 100);
    return send(req, res, 200, findStickers(q));
  }

  if (req.method !== 'POST') throw new HttpError(404, 'Нет такого адреса');
  const body = await readJson(req);

  switch (url.pathname) {
    case '/api/skin': {
      const teams = teamsOf(body);
      const defindex = int(body.defindex, 0, 100000, 'оружие');
      const weapon = weaponByDefindex.get(defindex);
      if (!weapon) throw new HttpError(400, 'Нет такого оружия');
      const paint = int(body.paint, 0, 100000, 'скин');
      if (paint !== 0 && !paintsByDefindex.get(defindex)?.has(paint)) throw new HttpError(400, 'Нет такого скина у этого оружия');
      const stickers = (Array.isArray(body.stickers) ? body.stickers : []).slice(0, 5).map((id) => {
        const n = int(id, 0, 1e7, 'наклейка');
        if (n && !stickerInfo(n)) throw new HttpError(400, 'Нет такой наклейки');
        return n;
      });
      const keychain = int(body.keychain, 0, 1e7, 'брелок');
      if (keychain && !keychainIds.has(keychain)) throw new HttpError(400, 'Нет такого брелока');
      const isKnife = weapon.category === 'knives';
      if (paint === 0) {
        // No skin: the plain weapon; for a knife, the plain knife of this type
        if (isKnife) db.saveKnife(steamId, teams, weapon.class);
        db.removeSkin(steamId, teams, defindex);
        return send(req, res, 200, await afterSave(steamId));
      }
      db.saveSkin(steamId, teams, {
        defindex, paint,
        wear: wearOf(body.wear),
        seed: int(body.seed, 0, 1000, 'паттерн'),
        nametag: nametagOf(body.nametag),
        stattrak: body.stattrak === true,
        stickers: isKnife ? [] : stickers,
        keychain: isKnife ? 0 : keychain,
      }, isKnife ? weapon.class : null);
      return send(req, res, 200, await afterSave(steamId));
    }
    case '/api/skin/remove': {
      const teams = teamsOf(body);
      const defindex = int(body.defindex, 0, 100000, 'оружие');
      if (!weaponByDefindex.has(defindex)) throw new HttpError(400, 'Нет такого оружия');
      db.removeSkin(steamId, teams, defindex);
      return send(req, res, 200, await afterSave(steamId));
    }
    case '/api/knife': {
      const teams = teamsOf(body);
      const knife = body.knife ? String(body.knife) : null;
      if (knife && !knifeClasses.has(knife)) throw new HttpError(400, 'Нет такого ножа');
      db.saveKnife(steamId, teams, knife);
      return send(req, res, 200, await afterSave(steamId));
    }
    case '/api/gloves': {
      const teams = teamsOf(body);
      let glove = null;
      if (body.defindex) {
        const defindex = int(body.defindex, 1, 100000, 'перчатки');
        const paint = int(body.paint, 0, 100000, 'скин перчаток');
        if (!gloveKeys.has(`${defindex}:${paint}`)) throw new HttpError(400, 'Нет таких перчаток');
        glove = { defindex, paint, wear: wearOf(body.wear), seed: int(body.seed, 0, 1000, 'паттерн') };
      }
      db.saveGloves(steamId, teams, glove);
      return send(req, res, 200, await afterSave(steamId));
    }
    case '/api/music': {
      const teams = teamsOf(body);
      const id = int(body.id, 0, 1e7, 'музыка');
      if (id && !musicIds.has(id)) throw new HttpError(400, 'Нет такого набора музыки');
      db.saveMusic(steamId, teams, id);
      return send(req, res, 200, await afterSave(steamId));
    }
    case '/api/pin': {
      const teams = teamsOf(body);
      const id = int(body.id, 0, 1e7, 'значок');
      if (id && !pinIds.has(id)) throw new HttpError(400, 'Нет такого значка');
      db.savePin(steamId, teams, id);
      return send(req, res, 200, await afterSave(steamId));
    }
    case '/api/agent': {
      const teams = teamsOf(body);
      const model = body.model ? String(body.model) : null;
      if (model && !agentModels.has(model)) throw new HttpError(400, 'Нет такого агента');
      // An agent belongs to one side
      db.saveAgent(steamId, model ? [agentModels.get(model)] : teams, model);
      return send(req, res, 200, await afterSave(steamId));
    }
  }
  throw new HttpError(404, 'Нет такого адреса');
}

// ---- who is at this computer ----------------------------------------------
// The club PCs are shared: a login holds only while its player is on the server
// and plays from the same computer the browser runs on.

const PRESENCE_TTL_MS = 10_000;
const presence = new Map(); // steamId -> { ip, at }

const normalizeIp = (ip) => {
  const clean = String(ip ?? '').replace(/^::ffff:/, '');
  return clean === '::1' ? '127.0.0.1' : clean;
};
const clientIp = (req) => normalizeIp(req.socket.remoteAddress);

// Addresses of this machine: a player on it (game via 127.0.0.1) may open the site by its LAN address
const OWN_ADDRESSES = new Set(['127.0.0.1',
  ...Object.values(os.networkInterfaces()).flat().filter((a) => a?.family === 'IPv4').map((a) => a.address)]);
const sameComputer = (gameIp, browserIp) =>
  gameIp === browserIp || (OWN_ADDRESSES.has(gameIp) && OWN_ADDRESSES.has(browserIp));

// RCON to every server; first answer matching `pattern` wins
async function askServers(command, pattern) {
  const list = config.servers;
  const results = await Promise.allSettled(list.map((s) =>
    rconCommand(s.host, Number(s.port), s.rconPassword ?? '', command)));
  let reached = false;
  for (const [i, r] of results.entries()) {
    if (r.status === 'rejected') {
      console.warn(`[${list[i].name ?? list[i].host}] ${r.reason.message}`);
      continue;
    }
    reached = true;
    const m = pattern.exec(r.value);
    if (m) return m;
  }
  if (!reached && list.length) throw new HttpError(503, 'Сервер не отвечает. Попробуйте через минуту.');
  return null;
}

// IP the player plays from, or null when he is not on any server
const IP_RE = String.raw`(\d{1,3}(?:\.\d{1,3}){3})`;
async function gameIp(steamId) {
  const cached = presence.get(steamId);
  if (cached && Date.now() - cached.at < PRESENCE_TTL_MS) return cached.ip;
  const m = await askServers(`css_wp_ip ${steamId}`, new RegExp(`wp_ip ${steamId}: ${IP_RE}`));
  const ip = m ? m[1] : null;
  presence.set(steamId, { ip, at: Date.now() });
  return ip;
}

// Nothing to type: the player who plays from this computer is the one at this browser
async function autoLogin(req, res) {
  if (config.servers.length === 0) throw new HttpError(503, 'В настройках сайта нет серверов');
  const ip = clientIp(req);
  const who = OWN_ADDRESSES.has(ip) ? 'local' : ip;
  if (who !== 'local' && !/^\d{1,3}(\.\d{1,3}){3}$/.test(who)) throw new HttpError(400, 'Неизвестный адрес');
  const m = await askServers(`css_wp_who ${who}`, new RegExp(String.raw`wp_who ${who.replace(/\./g, '\\.')}: (\d{17}|many)`));
  if (!m) throw new HttpError(404, 'Не нашли вас на сервере. Зайдите на сервер с этого компьютера, страница откроется сама.');
  if (m[1] === 'many') throw new HttpError(409, 'С этого компьютера на сервере несколько игроков, не понять, кто из них вы.');
  presence.delete(m[1]);
  send(req, res, 200, { ok: true }, undefined, { 'set-cookie': sessionCookie(m[1], 'game') });
}

// SteamID of the player at this browser, or 401
async function currentPlayer(req) {
  const session = readSession(req);
  if (!session) throw new HttpError(401, 'Не вошли');
  if (session.kind === 'dev' && config.devLogin) return session.steamId;
  const ip = await gameIp(session.steamId);
  if (!ip || !sameComputer(ip, clientIp(req))) throw new HttpError(401, 'Не вошли');
  return session.steamId;
}

const isLocal = (req) => clientIp(req) === '127.0.0.1';

async function handle(req, res) {
  const url = new URL(req.url, config.publicUrl);

  if (req.method === 'GET' && STATIC[url.pathname]) {
    const [file, type] = STATIC[url.pathname];
    return send(req, res, 200, fs.readFileSync(path.join(PUBLIC_DIR, file)), type, { 'cache-control': 'no-cache' });
  }

  // Item pictures: open to everyone, the in-game menu loads them too
  if (req.method === 'GET' && url.pathname === '/img/ok') return send(req, res, 200, 'ok', 'text/plain; charset=utf-8');
  if (req.method === 'GET' && url.pathname.startsWith('/img/')) {
    const data = await getImage(url.pathname.slice(5)).catch(() => null);
    if (!data) throw new HttpError(404, 'Нет такой картинки');
    res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' });
    return res.end(data);
  }

  if (url.pathname === '/auth/auto' && req.method === 'POST') return autoLogin(req, res);
  if (url.pathname === '/auth/logout' && req.method === 'POST') return redirect(res, '/', clearCookie());
  if (url.pathname === '/auth/dev' && config.devLogin && isLocal(req)) {
    const steamId = url.searchParams.get('steamid') ?? '';
    if (!/^\d{17}$/.test(steamId)) throw new HttpError(400, 'Нужен SteamID64');
    return redirect(res, '/', sessionCookie(steamId, 'dev'));
  }

  if (url.pathname.startsWith('/api/')) {
    const steamId = await currentPlayer(req);
    return api(req, res, url, steamId);
  }

  throw new HttpError(404, 'Нет такой страницы');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(req, res, status, { error: status === 500 ? 'Ошибка на сервере' : e.message });
  });
});

server.listen(config.port, config.host, () => {
  console.log(`Сайт скинов: ${config.publicUrl} (слушает ${config.host}:${config.port})`);
  console.log(`База плагина: ${config.database}`);
  console.log(`Оружие: ${catalog.weapons.length}, скинов: ${Object.values(catalog.skins).reduce((n, l) => n + l.length, 0)}, перчаток: ${catalog.gloves.length}`);
  if (config.devLogin) console.warn('Включён devLogin: вход без кода с этого компьютера. Для турнира выключите.');
  if (config.servers.length === 0) console.warn('В config.json нет servers: скины применятся только после !wp или перезахода.');

  prefetchImages(prefetchList());
});
