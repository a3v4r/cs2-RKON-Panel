import net from 'node:net';

// CS2 sends no end-of-reply packet: a reply ends when the socket goes quiet
const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;

const CONNECT_TIMEOUT_MS = 3000;
const FIRST_REPLY_TIMEOUT_MS = 1500;
const QUIET_AFTER_REPLY_MS = 250;
const TOTAL_TIMEOUT_MS = 6000;

function packet(id, type, body) {
  const payload = Buffer.from(body, 'utf8');
  const buf = Buffer.alloc(14 + payload.length);
  buf.writeInt32LE(10 + payload.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  return buf;
}

function parsePackets(buffer) {
  const packets = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const size = buffer.readInt32LE(offset);
    if (buffer.length - offset - 4 < size) break;
    packets.push({
      id: buffer.readInt32LE(offset + 4),
      type: buffer.readInt32LE(offset + 8),
      body: buffer.toString('utf8', offset + 12, offset + 4 + size - 2),
    });
    offset += 4 + size;
  }
  return { packets, rest: buffer.subarray(offset) };
}

export function rconCommand(host, port, password, command) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let pending = Buffer.alloc(0);
    let authed = false;
    let output = '';
    let quietTimer;
    let done = false;

    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(quietTimer);
      clearTimeout(totalTimer);
      socket.destroy();
      if (err) reject(err);
      else resolve(output);
    };

    const totalTimer = setTimeout(() => (authed ? finish() : finish(new Error('RCON: нет ответа'))), TOTAL_TIMEOUT_MS);
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      if (!authed) finish(new Error(`RCON: не удалось подключиться к ${host}:${port}`));
    });
    socket.on('connect', () => socket.write(packet(1, SERVERDATA_AUTH, password)));
    socket.on('error', (e) => finish(new Error(`RCON ${host}:${port}: ${e.message}`)));
    socket.on('close', () => finish(authed ? undefined : new Error('RCON: соединение закрыто')));
    socket.on('data', (chunk) => {
      const parsed = parsePackets(Buffer.concat([pending, chunk]));
      pending = parsed.rest;
      for (const p of parsed.packets) {
        if (!authed) {
          if (p.type !== SERVERDATA_AUTH_RESPONSE) continue;
          if (p.id === -1) return finish(new Error('RCON: неверный пароль'));
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
