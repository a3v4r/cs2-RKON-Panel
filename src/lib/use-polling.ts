"use client";

import React from 'react';

// Repeating request that never overlaps itself: the next tick is scheduled only
// after the previous request finished, and ticks are skipped while the tab is
// hidden. With a plain setInterval a slow game server made every poll pile up
// on top of the previous one, and an older answer could overwrite a newer one.
export function usePolling(fn: () => Promise<unknown>, intervalMs: number) {
  const latest = React.useRef(fn);
  latest.current = fn;

  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    const tick = async () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(tick, intervalMs);
        return;
      }
      if (inFlight) return;
      inFlight = true;
      try {
        await latest.current();
      } catch {
        // the request function reports its own errors
      } finally {
        inFlight = false;
        if (!stopped) timer = setTimeout(tick, intervalMs);
      }
    };

    const onVisibility = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      tick();
    };

    tick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
