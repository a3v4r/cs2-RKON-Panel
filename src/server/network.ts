import dgram from 'node:dgram';
import os from 'node:os';

// All LAN IPv4 addresses of this machine (for showing the panel/phone URL).
export function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .map((a) => a.address);
}

// The address of the default-route interface: a UDP "connect" picks the route without sending anything.
export function primaryAddress(): Promise<string> {
  return new Promise((resolve) => {
    const fallback = lanAddresses()[0] ?? '127.0.0.1';
    const socket = dgram.createSocket('udp4');
    socket.on('error', () => { socket.close(); resolve(fallback); });
    socket.connect(53, '8.8.8.8', () => {
      const address = socket.address().address;
      socket.close();
      resolve(address && address !== '0.0.0.0' ? address : fallback);
    });
  });
}

const isLoopback = (host: string) => host === 'localhost' || host.startsWith('127.') || host === '::1';

// Address of this machine as seen from the game server at `host` (MatchZy downloads match configs from it):
// loopback when the game server runs here, else our address in the same /24, else the default-route one.
export async function addressFor(host: string): Promise<string> {
  const own = lanAddresses();
  if (isLoopback(host) || own.includes(host)) return '127.0.0.1';
  const subnet = host.split('.').slice(0, 3).join('.') + '.';
  return own.find((a) => a.startsWith(subnet)) ?? (await primaryAddress());
}
