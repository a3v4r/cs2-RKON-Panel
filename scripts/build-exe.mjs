// Matchdesk.exe = this node + launcher/main.cjs + standalone panel as app.zip asset.
// Node SEA via --build-sea, needs Node 25.5+. Run after `npm run package`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const standalone = path.resolve('.next/standalone');
const dist = path.resolve('dist');
if (!fs.existsSync(path.join(standalone, 'server.js'))) throw new Error('No .next/standalone: run `npm run package` first');

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const buildId = fs.readFileSync(path.join(standalone, '.next', 'BUILD_ID'), 'utf8').trim();
const build = `${version}-${buildId}`;

// SEA entry can't import() ESM (skins site); the launcher requires this shim
fs.writeFileSync(path.join(standalone, 'matchdesk-run.cjs'),
  "module.exports = (file) => import(require('node:url').pathToFileURL(file).href);\n");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);
const zip = path.join(dist, 'app.zip');
// Windows tar: -a picks zip from the extension
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe') : 'tar';
execFileSync(tar, ['-a', '-c', '-f', zip, '-C', standalone, '.'], { stdio: 'inherit' });
fs.writeFileSync(path.join(dist, 'build.txt'), build);

const config = {
  main: path.resolve('launcher/main.cjs'),
  output: path.join(dist, 'Matchdesk.exe'),
  assets: { 'app.zip': zip, 'build.txt': path.join(dist, 'build.txt') },
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
};
const configFile = path.join(dist, 'sea-config.json');
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
execFileSync(process.execPath, ['--build-sea', configFile], { stdio: 'inherit' });

fs.rmSync(configFile);
fs.rmSync(path.join(dist, 'build.txt'));
// also shipped for plain `node server.js`, e.g. on Linux
fs.renameSync(zip, path.join(dist, `matchdesk-${version}-app.zip`));
const mb = (f) => `${Math.round(fs.statSync(f).size / 1024 / 1024)} MB`;
console.log(`Matchdesk.exe ${build}: ${mb(config.output)}`);
