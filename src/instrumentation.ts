// on server start: background jobs that must run with no browser open
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./server/scheduler');
    startScheduler();
    const { startSystemSampler } = await import('./server/system');
    startSystemSampler();
    const { startInstanceWatcher } = await import('./server/instances');
    startInstanceWatcher().catch(() => {});
    const { startBackupScheduler } = await import('./server/backups');
    startBackupScheduler();
    const { startPluginAutoUpdate } = await import('./server/plugins');
    startPluginAutoUpdate();
    const { startSkinsSite } = await import('./server/skins-site');
    startSkinsSite();
  }
}
