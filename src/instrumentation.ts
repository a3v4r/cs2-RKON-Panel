// Runs once when the panel server starts: background jobs that must work without any browser open.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./server/scheduler');
    startScheduler();
    const { startSystemSampler } = await import('./server/system');
    startSystemSampler();
    const { startInstanceWatcher } = await import('./server/instances');
    startInstanceWatcher().catch(() => {});
  }
}
