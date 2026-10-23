import dgram from 'node:dgram';

// A2S_INFO (https://developer.valvesoftware.com/wiki/Server_queries#A2S_INFO), with the challenge round trip CS2 requires.
const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const QUERY = Buffer.concat([HEADER, Buffer.from('TSource Engine Query\0', 'latin1')]);
const TIMEOUT_MS = 2000;

export interface A2SInfo {
  name: string;
  map: string;
  players: number;
  maxPlayers: number;
  bots: number;
  keywords: string;
  ping: number;
}

class Reader {
  constructor(private buf: Buffer, private pos = 0) {}
  byte() { return this.buf.readUInt8(this.pos++); }
  short() { const v = this.buf.readUInt16LE(this.pos); this.pos += 2; return v; }
  int32() { const v = this.buf.readInt32LE(this.pos); this.pos += 4; return v; }
  float() { const v = this.buf.readFloatLE(this.pos); this.pos += 4; return v; }
  skip(n: number) { this.pos += n; }
  string() {
    const end = this.buf.indexOf(0, this.pos);
    if (end === -1) {
      const s = this.buf.toString('utf8', this.pos);
      this.pos = this.buf.length;
      return s;
    }
    const s = this.buf.toString('utf8', this.pos, end);
    this.pos = end + 1;
    return s;
  }
  get left() { return this.buf.length - this.pos; }
}

function parseInfo(msg: Buffer, ping: number): A2SInfo {
  const r = new Reader(msg, 5); // FF FF FF FF 'I'
  r.byte(); // protocol
  const name = r.string();
  const map = r.string();
  r.string(); // folder
  r.string(); // game
  r.short(); // app id
  const players = r.byte();
  const maxPlayers = r.byte();
  const bots = r.byte();
  r.byte(); r.byte(); r.byte(); r.byte(); // server type, environment, visibility, vac
  r.string(); // version
  let keywords = '';
  if (r.left > 0) {
    const edf = r.byte();
    if (edf & 0x80) r.short(); // port
    if (edf & 0x10) r.skip(8); // steam id
    if (edf & 0x40) { r.short(); r.string(); } // source tv
    if (edf & 0x20) keywords = r.string();
  }
  return { name, map, players, maxPlayers, bots, keywords, ping };
}

export function queryInfo(host: string, port: number): Promise<A2SInfo> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const started = Date.now();
    const timer = setTimeout(() => { socket.close(); reject(new Error('A2S: сервер не отвечает')); }, TIMEOUT_MS);

    socket.on('error', (e) => { clearTimeout(timer); socket.close(); reject(e); });
    socket.on('message', (msg) => {
      if (msg.length < 5 || msg.readInt32LE(0) !== -1) return;
      const type = String.fromCharCode(msg[4]);
      if (type === 'A') {
        socket.send(Buffer.concat([QUERY, msg.subarray(5, 9)]), port, host);
      } else if (type === 'I') {
        clearTimeout(timer);
        socket.close();
        try {
          resolve(parseInfo(msg, Date.now() - started));
        } catch (e) {
          reject(e);
        }
      }
    });
    socket.send(QUERY, port, host);
  });
}

// A2S_PLAYER (https://developer.valvesoftware.com/wiki/Server_queries#A2S_PLAYER):
// names and the score the server keeps for each player. There is no team or ping here.
export interface A2SPlayer {
  name: string;
  score: number;
  duration: number;
}

const PLAYER_QUERY = Buffer.concat([HEADER, Buffer.from([0x55]), Buffer.from([0xff, 0xff, 0xff, 0xff])]);

function parsePlayers(msg: Buffer): A2SPlayer[] {
  const r = new Reader(msg, 5); // FF FF FF FF 'D'
  const count = r.byte();
  const players: A2SPlayer[] = [];
  for (let i = 0; i < count && r.left > 0; i++) {
    r.byte(); // player index
    const name = r.string();
    if (r.left < 8) break; // truncated packet: score + duration do not fit
    const score = r.int32();
    const duration = r.float();
    if (name.trim()) players.push({ name, score, duration });
  }
  return players;
}

// The server answers the first request with a challenge ('A'), and the player list ('D')
// only comes after the request is repeated with that challenge.
export function queryPlayers(host: string, port: number): Promise<A2SPlayer[]> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const timer = setTimeout(() => { socket.close(); reject(new Error('A2S: список игроков не получен')); }, TIMEOUT_MS);

    socket.on('error', (e) => { clearTimeout(timer); socket.close(); reject(e); });
    socket.on('message', (msg) => {
      if (msg.length < 5 || msg.readInt32LE(0) !== -1) return;
      const type = String.fromCharCode(msg[4]);
      if (type === 'A' && msg.length >= 9) {
        socket.send(Buffer.concat([HEADER, Buffer.from([0x55]), msg.subarray(5, 9)]), port, host);
      } else if (type === 'D') {
        clearTimeout(timer);
        socket.close();
        try {
          resolve(parsePlayers(msg));
        } catch (e) {
          reject(e);
        }
      }
    });
    socket.send(PLAYER_QUERY, port, host);
  });
}
