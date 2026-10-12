import net from 'node:net';

// Source RCON (https://developer.valvesoftware.com/wiki/Source_RCON_Protocol).
// CS2 does not echo the usual empty-packet terminator, so a reply ends when the socket goes quiet.
const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;

const CONNECT_TIMEOUT_MS = 4000;
const FIRST_REPLY_TIMEOUT_MS = 1500; // commands like "say" never answer
const QUIET_AFTER_REPLY_MS = 250;
const TOTAL_TIMEOUT_MS = 8000;

function packet(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, 'utf8');
  const buf = Buffer.alloc(14 + payload.length);
  buf.writeInt32LE(10 + payload.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  return buf; // last two bytes stay 0x00 0x00
}

interface Packet {
  id: number;
  type: number;
  body: string;
}

function parsePackets(buffer: Buffer): { packets: Packet[]; rest: Buffer } {
  const packets: Packet[] = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const size = buffer.readInt32LE(offset);
    if (buffer.length - offset - 4 < size) break;
    const id = buffer.readInt32LE(offset + 4);
    const type = buffer.readInt32LE(offset + 8);
    const body = buffer.toString('utf8', offset + 12, offset + 4 + size - 2);
    packets.push({ id, type, body });
    offset += 4 + size;
  }
  return { packets, rest: buffer.subarray(offset) };
}

export class RconError extends Error {}

export function rconCommand(host: string, port: number, password: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let pending: Buffer = Buffer.alloc(0);
    let authed = false;
    let output = '';
    let quietTimer: NodeJS.Timeout | undefined;
    let done = false;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(quietTimer);
      clearTimeout(totalTimer);
      socket.destroy();
      if (err) reject(err);
      else resolve(output);
    };

    const totalTimer = setTimeout(() => (authed ? finish() : finish(new RconError('RCON: нет ответа от сервера'))), TOTAL_TIMEOUT_MS);
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      if (!authed) finish(new RconError(`RCON: не удалось подключиться к ${host}:${port}`));
    });

    socket.on('connect', () => socket.write(packet(1, SERVERDATA_AUTH, password)));
    socket.on('error', (e) => finish(new RconError(`RCON: ${e.message}`)));
    socket.on('close', () => finish(authed ? undefined : new RconError('RCON: соединение закрыто сервером')));

    socket.on('data', (chunk) => {
      const parsed = parsePackets(Buffer.concat([pending, chunk]));
      pending = parsed.rest;
      for (const p of parsed.packets) {
        if (!authed) {
          if (p.type !== SERVERDATA_AUTH_RESPONSE) continue;
          if (p.id === -1) return finish(new RconError('RCON: неверный пароль'));
          authed = true;
          socket.setTimeout(0);
          socket.write(packet(2, SERVERDATA_EXECCOMMAND, command));
          quietTimer = setTimeout(() => finish(), FIRST_REPLY_TIMEOUT_MS);
        } else if (p.id === 2) {
          output += p.body;
          clearTimeout(quietTimer);
          quietTimer = setTimeout(() => finish(), QUIET_AFTER_REPLY_MS);
        }
      }
    });
  });
}
