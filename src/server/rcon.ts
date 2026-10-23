import net from 'node:net';

// Source RCON (https://developer.valvesoftware.com/wiki/Source_RCON_Protocol).
// CS2 does not echo the usual empty-packet terminator, so a reply ends when the socket goes quiet.
//
// One authenticated connection is kept per server and commands are queued on it:
// a command no longer pays for a new TCP connection and AUTH every time, and the
// game server sees one stable RCON client instead of one per poll.
const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;

function envMs(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const CONNECT_TIMEOUT_MS = envMs('RCON_CONNECT_TIMEOUT_MS', 4000);
const FIRST_REPLY_TIMEOUT_MS = envMs('RCON_FIRST_REPLY_TIMEOUT_MS', 1500); // commands like "say" never answer
const QUIET_AFTER_REPLY_MS = envMs('RCON_QUIET_MS', 100);
const TOTAL_TIMEOUT_MS = envMs('RCON_TOTAL_TIMEOUT_MS', 8000);
const SILENT_GRACE_MS = envMs('RCON_SILENT_GRACE_MS', 120);
const IDLE_CLOSE_MS = envMs('RCON_IDLE_MS', 60_000);
const MAX_PENDING = 100;
const MAX_PACKET_BYTES = 8 * 1024 * 1024;

// Commands that only produce in-game effects and never answer over RCON. Waiting
// the full 1.5 s "first reply" timeout for them was a large part of the panel lag.
const SILENT_COMMAND = /^(?:say|say_team)\b|^(?:css_forcepause|css_forceunpause|css_start|get5_endmatch|mp_restartgame)\b|^(?:map|changelevel)\s/i;

export function isSilentCommand(command: string): boolean {
  return SILENT_COMMAND.test(command.trim());
}

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

function parsePackets(buffer: Buffer): { packets: Packet[]; rest: Buffer; error?: string } {
  const packets: Packet[] = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const size = buffer.readInt32LE(offset);
    if (size < 10 || size > MAX_PACKET_BYTES) {
      return { packets, rest: Buffer.alloc(0), error: 'сервер прислал некорректный пакет' };
    }
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

function networkError(e: NodeJS.ErrnoException, host: string, port: number): string {
  switch (e.code) {
    case 'ECONNREFUSED': return `RCON: сервер ${host}:${port} не принимает подключения (выключен или неверный порт)`;
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH': return `RCON: ${host}:${port} недоступен по сети`;
    case 'ENOTFOUND': return `RCON: адрес ${host} не найден`;
    case 'ECONNRESET': return 'RCON: сервер разорвал соединение';
    default: return `RCON: ${e.message}`;
  }
}

export type RconPriority = 'high' | 'normal';

export interface RconOptions {
  // Default: false for chat/action commands (see isSilentCommand), true otherwise.
  // With false the call returns shortly after the command was written instead of
  // waiting 1.5 s for a reply that will never come.
  expectReply?: boolean;
  // User actions (pause, console) jump ahead of background polls.
  priority?: RconPriority;
  // Cap for this command; time spent queued is not counted.
  timeoutMs?: number;
}

interface Job {
  command: string;
  expectReply: boolean;
  timeoutMs: number;
  resolve: (output: string) => void;
  reject: (error: Error) => void;
  output: string;
  done: boolean;
  firstTimer?: NodeJS.Timeout;
  quietTimer?: NodeJS.Timeout;
  totalTimer?: NodeJS.Timeout;
  graceTimer?: NodeJS.Timeout;
}

function clearJobTimers(job: Job) {
  clearTimeout(job.firstTimer);
  clearTimeout(job.quietTimer);
  clearTimeout(job.totalTimer);
  clearTimeout(job.graceTimer);
}

class RconSession {
  private key: string;
  private host: string;
  private port: number;
  private socket: net.Socket;
  private buffer: Buffer = Buffer.alloc(0);
  private authed = false;
  private closed = false;
  private active: Job | null = null;
  private high: Job[] = [];
  private normal: Job[] = [];
  private idleTimer?: NodeJS.Timeout;
  private ignoreTimer?: NodeJS.Timeout;
  // A late reply to a fire-and-forget command must not become the next command's answer.
  private ignoreUntil = 0;

  constructor(key: string, host: string, port: number, password: string) {
    this.key = key;
    this.host = host;
    this.port = port;
    this.socket = net.createConnection({ host, port });
    this.socket.setNoDelay(true);
    this.socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      if (!this.authed && !this.closed) this.fail(new RconError(`RCON: не удалось подключиться к ${host}:${port}`));
    });

    this.socket.on('connect', () => {
      if (this.closed) return;
      this.socket.write(packet(1, SERVERDATA_AUTH, password));
    });
    this.socket.on('data', (chunk) => this.onData(chunk));
    this.socket.on('error', (e) => this.fail(new RconError(networkError(e as NodeJS.ErrnoException, host, port))));
    this.socket.on('close', () => this.onClose());
  }

  isOpen(): boolean {
    return !this.closed;
  }

  enqueue(command: string, options: RconOptions): Promise<string> {
    if (this.closed) return Promise.reject(new RconError('RCON: соединение закрыто'));
    if (this.high.length + this.normal.length >= MAX_PENDING) {
      return Promise.reject(new RconError('RCON: слишком много команд в очереди'));
    }
    return new Promise<string>((resolve, reject) => {
      const job: Job = {
        command,
        expectReply: options.expectReply ?? !isSilentCommand(command),
        timeoutMs: options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : TOTAL_TIMEOUT_MS,
        resolve,
        reject,
        output: '',
        done: false,
      };
      (options.priority === 'high' ? this.high : this.normal).push(job);
      this.clearIdle();
      this.pump();
    });
  }

  private pump() {
    if (this.closed || !this.authed || this.active) return;
    if (Date.now() < this.ignoreUntil) {
      if (!this.ignoreTimer) {
        this.ignoreTimer = setTimeout(() => {
          this.ignoreTimer = undefined;
          this.pump();
        }, this.ignoreUntil - Date.now());
      }
      return;
    }

    const job = this.high.shift() ?? this.normal.shift();
    if (!job) {
      this.armIdle();
      return;
    }

    this.clearIdle();
    this.active = job;
    job.totalTimer = setTimeout(() => this.finish(job, true), job.timeoutMs);
    if (job.expectReply) {
      job.firstTimer = setTimeout(() => this.finish(job, true), FIRST_REPLY_TIMEOUT_MS);
    } else {
      job.graceTimer = setTimeout(() => this.finish(job), SILENT_GRACE_MS);
    }

    try {
      this.socket.write(packet(2, SERVERDATA_EXECCOMMAND, job.command));
    } catch (e) {
      this.fail(new RconError(`RCON: не удалось отправить команду: ${(e as Error).message}`));
    }
  }

  private onData(chunk: Buffer) {
    if (this.closed) return;
    const parsed = parsePackets(Buffer.concat([this.buffer, chunk]));
    this.buffer = parsed.rest;
    if (parsed.error) {
      this.fail(new RconError(`RCON: ${parsed.error}`));
      return;
    }

    for (const p of parsed.packets) {
      if (this.closed) return;
      if (!this.authed) {
        if (p.type !== SERVERDATA_AUTH_RESPONSE) continue;
        if (p.id === -1) {
          this.fail(new RconError('RCON: неверный пароль'));
          return;
        }
        this.authed = true;
        this.socket.setTimeout(0);
        this.pump();
        continue;
      }
      this.onPacket(p);
    }
  }

  private onPacket(p: Packet) {
    const job = this.active;
    if (!job || job.done || p.type !== SERVERDATA_AUTH_RESPONSE || p.id !== 2) return;

    if (p.body) job.output += p.body;

    if (job.expectReply) {
      clearTimeout(job.firstTimer);
      // An empty packet is Source RCON's terminator (CS2 usually omits it,
      // but other Source servers send it); finish as soon as it arrives.
      if (!p.body) {
        this.finish(job);
        return;
      }
      clearTimeout(job.quietTimer);
      job.quietTimer = setTimeout(() => this.finish(job), QUIET_AFTER_REPLY_MS);
      return;
    }

    // Fire-and-forget: a refusal/error that comes back immediately is still shown.
    clearTimeout(job.graceTimer);
    clearTimeout(job.quietTimer);
    if (!p.body) {
      this.finish(job);
      return;
    }
    job.quietTimer = setTimeout(() => this.finish(job), QUIET_AFTER_REPLY_MS);
  }

  private finish(job: Job, resetSession = false) {
    if (job.done) return;
    job.done = true;
    clearJobTimers(job);
    const silentWithoutReply = !job.expectReply && !job.output;
    if (this.active === job) this.active = null;
    job.resolve(job.output);
    if (this.closed) return;

    if (silentWithoutReply) this.ignoreUntil = Date.now() + QUIET_AFTER_REPLY_MS;

    // A command that timed out may still answer later. Keeping the connection
    // would let that late answer be read as the reply to the next command, so
    // the session is dropped; queued commands get a clear error and reconnect.
    if (resetSession) {
      this.fail(new RconError('RCON: сервер не ответил вовремя, повторите команду'));
      return;
    }
    this.pump();
  }

  private fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    const jobs: Job[] = [];
    if (this.active) jobs.push(this.active);
    jobs.push(...this.high, ...this.normal);
    this.active = null;
    this.high = [];
    this.normal = [];
    this.clearIdle();
    clearTimeout(this.ignoreTimer);
    this.ignoreTimer = undefined;

    for (const job of jobs) {
      if (job.done) continue;
      job.done = true;
      clearJobTimers(job);
      job.reject(error);
    }
    if (sessions.get(this.key) === this) sessions.delete(this.key);
    this.socket.destroy();
  }

  private onClose() {
    if (this.closed) return;
    this.closed = true;
    const jobs: Job[] = [];
    if (this.active) jobs.push(this.active);
    jobs.push(...this.high, ...this.normal);
    this.active = null;
    this.high = [];
    this.normal = [];
    this.clearIdle();
    clearTimeout(this.ignoreTimer);
    this.ignoreTimer = undefined;

    const error = new RconError(this.authed ? 'RCON: соединение закрыто сервером' : 'RCON: сервер закрыл соединение до авторизации');
    for (const job of jobs) {
      if (job.done) continue;
      job.done = true;
      clearJobTimers(job);
      // A reply that fully arrived just before the close is still usable.
      if (this.authed && job.output) job.resolve(job.output);
      else job.reject(error);
    }
    if (sessions.get(this.key) === this) sessions.delete(this.key);
  }

  private armIdle() {
    this.clearIdle();
    if (this.closed) return;
    this.idleTimer = setTimeout(() => {
      if (this.closed || this.active || this.high.length || this.normal.length) return;
      this.closed = true;
      if (sessions.get(this.key) === this) sessions.delete(this.key);
      this.socket.destroy();
    }, IDLE_CLOSE_MS);
    this.idleTimer.unref?.();
  }

  private clearIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  closeNow() {
    this.fail(new RconError('RCON: сессия закрыта'));
  }
}

const globalForRcon = globalThis as unknown as { rconSessions?: Map<string, RconSession> };
const sessions = (globalForRcon.rconSessions ??= new Map<string, RconSession>());

function sessionKey(host: string, port: number, password: string): string {
  // The password is part of the key so changing it opens a fresh session.
  return `${host}\u0000${port}\u0000${password}`;
}

function getSession(host: string, port: number, password: string): RconSession {
  const key = sessionKey(host, port, password);
  const existing = sessions.get(key);
  if (existing?.isOpen()) return existing;
  const session = new RconSession(key, host, port, password);
  sessions.set(key, session);
  return session;
}

export function rconCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  options: RconOptions = {},
): Promise<string> {
  try {
    return getSession(host, port, password).enqueue(command, options);
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new RconError(String(e)));
  }
}

// Closes every pooled connection (tests, shutdown, server removal).
export function closeRconSessions(): void {
  for (const session of [...sessions.values()]) session.closeNow();
  sessions.clear();
}
