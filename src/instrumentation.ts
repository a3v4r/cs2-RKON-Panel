// Runs once when the panel server starts: background jobs that must work without any browser open.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ startScheduler }, { startChatCollector }] = await Promise.all([
      import('./server/scheduler'),
      import('./server/chat-log'),
    ]);
    startScheduler();
    // Player chat is collected from the game server's HTTP log stream, with no browser open
    startChatCollector();
  }
}
