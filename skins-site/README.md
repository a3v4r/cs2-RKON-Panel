# CS2 skins website

**English** | [Русский](README.ru.md)

A website where players choose skins for the WeaponPaints plugin (the `a3v4r/cs2-WeaponPaints-sqlite` fork): weapons, knives, gloves, stickers, keychains, MVP music kits and pins. Separately for T and CT.

Usually Matchdesk runs it (`src/server/skins-site.ts`): it writes `config.json` into `PANEL_DATA_DIR\skins-site` with its servers and passes the path in `SKINS_CONFIG`. The manual start below is needed only when the website runs without the panel.

- Login without typing anything: a player opens the website on the computer they play from, and the website asks the server (`css_wp_who <ip>`) who plays from that IP. Works only on a local network where every computer has its own IP.
- Club computers are shared: a login lasts only while the player is on the server and at the same computer (`css_wp_ip`). If they leave or move to another seat, within a few seconds the page switches to whoever now plays from that computer. Cookies are session cookies.
- `!site` in game shows the website address: with `"Website": "auto"` in the plugin settings, the computer name (`aevar-pc/`), or its LAN IP if Windows generated the name (`DESKTOP-XXXXX`). If the name does not open on the network, put the IP into `Website`.
- Choices are written straight into the plugin's sqlite database (`weapon_paints.db`).
- After a save the website sends `css_wp_reload <steamid>` to the servers over RCON: if the player is on a server, the skin changes at once. The commands `css_site`, `css_wp_who`, `css_wp_ip` and `css_wp_reload` are in the plugin's `WebReload.cs`.
- No dependencies: only Node.js 22.13 or newer is needed (built-in `node:sqlite`).

## Running

1. Copy `config.example.json` to `config.json` and fill it in:
   - `pluginDir`: the WeaponPaints plugin folder on the server (with `weapon_paints.db` and `data/`);
   - `servers`: servers with this plugin and their RCON passwords;
   - `publicUrl`: the address players open.
2. `npm start` (or `node server.mjs`).

The website must run on the same machine as the server: it opens the plugin's database file directly.

## Address for players

The website is made for a local network and listens on port 80, so the address has no port: `http://192.168.0.10` or `computer-name/`.
- `publicUrl`: this address;
- in the plugin settings (`configs/plugins/WeaponPaints/WeaponPaints.json`) `"Website": "auto"`: `!site` shows the computer name by itself (or the IP for names like `DESKTOP-XXXXX`);
- open port 80 in Windows Firewall for the private network.

## Pictures

Item pictures are hosted on GitHub and load slowly from there. So the website keeps copies (`image-cache/`) and serves them at `/img/<file>`:
- on start it downloads in the background everything that is not on disk yet: about 12,500 files, roughly 1.4 GB (9,600+ of them stickers, downloaded last);
- a picture opened before its turn comes is downloaded at once;
- the in-game skins menu takes pictures from here too while the website answers (`"Website": "auto"`: the LAN IP of this computer on port 80); if the website is off, the menu loads them from GitHub.

Internet is needed only for the first download. Only this computer uses disk space; players store nothing.

## Settings

| Field | What it is |
|---|---|
| `port`, `host` | where the website listens, `0.0.0.0:80` by default |
| `publicUrl` | website address for players |
| `pluginDir` | plugin folder; `database` and `dataDir` can be set separately |
| `imageCacheDir` | folder for picture copies, `image-cache` next to the website by default |
| `language` | language of skin names from `data/*_<lang>.json`, `ru` by default |
| `servers` | `[{ name, host, port, rconPassword }]` |
| `devLogin` | login as any player at `/auth/dev?steamid=...`, only from this computer and without checking that the player is on the server. For development; turn it off at a tournament |

The login signing key is created by itself in the `.secret` file on the first start.
