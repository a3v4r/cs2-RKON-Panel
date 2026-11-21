import os from 'node:os';

// CPU and RAM of the PC the panel runs on (often the same PC as the game servers), sampled in the
// background so every judge sees the same last minutes, even right after opening the page.
const SAMPLE_MS = 5_000;
const KEEP = 120; // 10 minutes

export interface SystemSample {
  t: number;
  cpu: number; // %
  mem: number; // %
}

const g = globalThis as unknown as {
  systemTimer?: NodeJS.Timeout;
  systemSamples?: SystemSample[];
  systemPrevCpu?: { idle: number; total: number };
};
const samples = (g.systemSamples ??= []);

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function sample() {
  const now = cpuTimes();
  const prev = g.systemPrevCpu;
  g.systemPrevCpu = now;
  if (!prev) return; // the first reading only sets the baseline
  const total = now.total - prev.total;
  const cpu = total > 0 ? (1 - (now.idle - prev.idle) / total) * 100 : 0;
  const mem = (1 - os.freemem() / os.totalmem()) * 100;
  samples.push({ t: Date.now(), cpu: Math.round(cpu * 10) / 10, mem: Math.round(mem * 10) / 10 });
  if (samples.length > KEEP) samples.splice(0, samples.length - KEEP);
}

export function startSystemSampler() {
  if (g.systemTimer) return;
  sample();
  g.systemTimer = setInterval(sample, SAMPLE_MS);
}

export function systemInfo() {
  const total = os.totalmem();
  return {
    cpuModel: os.cpus()[0]?.model.trim() ?? '',
    cores: os.cpus().length,
    memTotalGb: Math.round((total / 1024 ** 3) * 10) / 10,
    memUsedGb: Math.round(((total - os.freemem()) / 1024 ** 3) * 10) / 10,
    samples,
  };
}
