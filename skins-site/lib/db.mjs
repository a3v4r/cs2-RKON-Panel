import { DatabaseSync } from 'node:sqlite';
import { config } from './config.mjs';

// WeaponPaints' own DB: the plugin reads what we write
const db = new DatabaseSync(config.database, { timeout: 5000 });
db.exec('PRAGMA journal_mode = WAL');

// plugin's schema, in case the site runs before the plugin ever has
db.exec(`
CREATE TABLE IF NOT EXISTS wp_player_skins (
  steamid varchar(18) NOT NULL, weapon_team int(1) NOT NULL, weapon_defindex int(6) NOT NULL,
  weapon_paint_id int(6) NOT NULL, weapon_wear float NOT NULL DEFAULT 0.000001, weapon_seed int(16) NOT NULL DEFAULT 0,
  weapon_nametag VARCHAR(128) DEFAULT NULL, weapon_stattrak tinyint(1) NOT NULL DEFAULT 0,
  weapon_stattrak_count int(10) NOT NULL DEFAULT 0,
  weapon_sticker_0 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0', weapon_sticker_1 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
  weapon_sticker_2 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0', weapon_sticker_3 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
  weapon_sticker_4 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0', weapon_keychain VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0',
  UNIQUE (steamid, weapon_team, weapon_defindex));
CREATE TABLE IF NOT EXISTS wp_player_knife (steamid varchar(18) NOT NULL, weapon_team int(1) NOT NULL, knife varchar(64) NOT NULL, UNIQUE (steamid, weapon_team));
CREATE TABLE IF NOT EXISTS wp_player_gloves (steamid varchar(18) NOT NULL, weapon_team int(1) NOT NULL, weapon_defindex int(11) NOT NULL, UNIQUE (steamid, weapon_team));
CREATE TABLE IF NOT EXISTS wp_player_agents (steamid varchar(18) NOT NULL, agent_ct varchar(64) DEFAULT NULL, agent_t varchar(64) DEFAULT NULL, UNIQUE (steamid));
CREATE TABLE IF NOT EXISTS wp_player_music (steamid varchar(64) NOT NULL, weapon_team int(1) NOT NULL, music_id int(11) NOT NULL, UNIQUE (steamid, weapon_team));
CREATE TABLE IF NOT EXISTS wp_player_pins (steamid varchar(64) NOT NULL, weapon_team int(1) NOT NULL, id int(11) NOT NULL, UNIQUE (steamid, weapon_team));
`);

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    fn();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const stickerId = (value) => Number(String(value ?? '0').split(';')[0]) || 0;

// team: 2 = T, 3 = CT
export function getLoadout(steamId) {
  const skins = db.prepare('SELECT * FROM wp_player_skins WHERE steamid = ?').all(steamId).map((r) => ({
    team: Number(r.weapon_team),
    defindex: Number(r.weapon_defindex),
    paint: Number(r.weapon_paint_id),
    wear: Number(r.weapon_wear),
    seed: Number(r.weapon_seed),
    nametag: r.weapon_nametag ?? '',
    stattrak: Number(r.weapon_stattrak) !== 0,
    stattrakCount: Number(r.weapon_stattrak_count),
    stickers: [0, 1, 2, 3, 4].map((i) => stickerId(r[`weapon_sticker_${i}`])),
    keychain: stickerId(r.weapon_keychain),
  }));
  const perTeam = (sql, column) => {
    const out = {};
    for (const r of db.prepare(sql).all(steamId)) out[Number(r.weapon_team)] = r[column];
    return out;
  };
  const agents = db.prepare('SELECT agent_ct, agent_t FROM wp_player_agents WHERE steamid = ?').get(steamId);
  return {
    skins,
    knife: perTeam('SELECT weapon_team, knife FROM wp_player_knife WHERE steamid = ?', 'knife'),
    gloves: perTeam('SELECT weapon_team, weapon_defindex FROM wp_player_gloves WHERE steamid = ?', 'weapon_defindex'),
    music: perTeam('SELECT weapon_team, music_id FROM wp_player_music WHERE steamid = ?', 'music_id'),
    pins: perTeam('SELECT weapon_team, id FROM wp_player_pins WHERE steamid = ?', 'id'),
    agents: { 2: agents?.agent_t ?? null, 3: agents?.agent_ct ?? null },
  };
}

const upsertSkin = db.prepare(`
INSERT INTO wp_player_skins (steamid, weapon_team, weapon_defindex, weapon_paint_id, weapon_wear, weapon_seed, weapon_nametag,
  weapon_stattrak, weapon_sticker_0, weapon_sticker_1, weapon_sticker_2, weapon_sticker_3, weapon_sticker_4, weapon_keychain)
VALUES (:steamid, :team, :defindex, :paint, :wear, :seed, :nametag, :stattrak, :s0, :s1, :s2, :s3, :s4, :keychain)
ON CONFLICT(steamid, weapon_team, weapon_defindex) DO UPDATE SET
  weapon_paint_id = :paint, weapon_wear = :wear, weapon_seed = :seed, weapon_nametag = :nametag, weapon_stattrak = :stattrak,
  weapon_sticker_0 = :s0, weapon_sticker_1 = :s1, weapon_sticker_2 = :s2, weapon_sticker_3 = :s3, weapon_sticker_4 = :s4,
  weapon_keychain = :keychain`);
const deleteSkin = db.prepare('DELETE FROM wp_player_skins WHERE steamid = ? AND weapon_team = ? AND weapon_defindex = ?');

const upsertKnife = db.prepare('INSERT INTO wp_player_knife (steamid, weapon_team, knife) VALUES (?, ?, ?) ON CONFLICT(steamid, weapon_team) DO UPDATE SET knife = excluded.knife');
const deleteKnife = db.prepare('DELETE FROM wp_player_knife WHERE steamid = ? AND weapon_team = ?');
const upsertGlove = db.prepare('INSERT INTO wp_player_gloves (steamid, weapon_team, weapon_defindex) VALUES (?, ?, ?) ON CONFLICT(steamid, weapon_team) DO UPDATE SET weapon_defindex = excluded.weapon_defindex');
const deleteGlove = db.prepare('DELETE FROM wp_player_gloves WHERE steamid = ? AND weapon_team = ?');
const upsertMusic = db.prepare('INSERT INTO wp_player_music (steamid, weapon_team, music_id) VALUES (?, ?, ?) ON CONFLICT(steamid, weapon_team) DO UPDATE SET music_id = excluded.music_id');
const deleteMusic = db.prepare('DELETE FROM wp_player_music WHERE steamid = ? AND weapon_team = ?');
const upsertPin = db.prepare('INSERT INTO wp_player_pins (steamid, weapon_team, id) VALUES (?, ?, ?) ON CONFLICT(steamid, weapon_team) DO UPDATE SET id = excluded.id');
const deletePin = db.prepare('DELETE FROM wp_player_pins WHERE steamid = ? AND weapon_team = ?');

function skinParams(steamId, team, s) {
  const stickers = [0, 1, 2, 3, 4].map((i) => `${s.stickers[i] ?? 0};0;0;0;0;0;0`);
  return {
    steamid: steamId, team, defindex: s.defindex, paint: s.paint, wear: s.wear, seed: s.seed,
    nametag: s.nametag || null, stattrak: s.stattrak ? 1 : 0,
    s0: stickers[0], s1: stickers[1], s2: stickers[2], s3: stickers[3], s4: stickers[4],
    keychain: `${s.keychain || 0};0;0;0;0`,
  };
}

// knife skins also need the knife row
export function saveSkin(steamId, teams, skin, knifeClass) {
  tx(() => {
    for (const team of teams) {
      upsertSkin.run(skinParams(steamId, team, skin));
      if (knifeClass) upsertKnife.run(steamId, team, knifeClass);
    }
  });
}

export function removeSkin(steamId, teams, defindex) {
  tx(() => { for (const team of teams) deleteSkin.run(steamId, team, defindex); });
}

// null = default knife
export function saveKnife(steamId, teams, knifeClass) {
  tx(() => {
    for (const team of teams) {
      if (knifeClass) upsertKnife.run(steamId, team, knifeClass);
      else deleteKnife.run(steamId, team);
    }
  });
}

// type in wp_player_gloves, paint in wp_player_skins; null = default gloves
export function saveGloves(steamId, teams, glove) {
  tx(() => {
    for (const team of teams) {
      if (!glove) {
        deleteGlove.run(steamId, team);
        continue;
      }
      upsertGlove.run(steamId, team, glove.defindex);
      upsertSkin.run(skinParams(steamId, team, { ...glove, nametag: '', stattrak: false, stickers: [], keychain: 0 }));
    }
  });
}

export function saveMusic(steamId, teams, id) {
  tx(() => { for (const team of teams) (id ? upsertMusic.run(steamId, team, id) : deleteMusic.run(steamId, team)); });
}

export function savePin(steamId, teams, id) {
  tx(() => { for (const team of teams) (id ? upsertPin.run(steamId, team, id) : deletePin.run(steamId, team)); });
}

export function saveAgent(steamId, teams, model) {
  tx(() => {
    const row = db.prepare('SELECT agent_ct, agent_t FROM wp_player_agents WHERE steamid = ?').get(steamId);
    let ct = row?.agent_ct ?? null;
    let t = row?.agent_t ?? null;
    if (teams.includes(3)) ct = model;
    if (teams.includes(2)) t = model;
    db.prepare(`INSERT INTO wp_player_agents (steamid, agent_ct, agent_t) VALUES (?, ?, ?)
      ON CONFLICT(steamid) DO UPDATE SET agent_ct = excluded.agent_ct, agent_t = excluded.agent_t`).run(steamId, ct, t);
  });
}
