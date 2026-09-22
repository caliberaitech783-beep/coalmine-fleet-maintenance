// Poll only while someone can see the page. A visible screen keeps its exact
// cadence; a hidden tab stops asking and catches up the moment it is shown
// again, so nobody waits for the next tick after switching back.
export function startVisiblePoll(run, intervalMs, {
  win = globalThis.window,
  doc = globalThis.document,
  keepPolling = () => false,
} = {}) {
  let timer = null;
  let running = false;
  let queued = false;
  let stopped = false;
  const visible = () => doc?.visibilityState !== "hidden";
  const tick = async () => {
    if (stopped) return;
    if (running) { queued = true; return; }
    win.clearTimeout(timer);
    timer = null;
    running = true;
    try { await run(); }
    catch {}
    finally {
      running = false;
      if (!stopped) {
        if (queued) { queued = false; void tick(); }
        else if (visible() || keepPolling()) timer = win.setTimeout(tick, intervalMs);
      }
    }
  };
  const resume = () => {
    if (!stopped && visible() && timer === null && !running) void tick();
  };
  doc?.addEventListener?.("visibilitychange", resume);
  win.addEventListener?.("focus", resume);
  win.addEventListener?.("online", resume);
  void tick();
  return () => {
    stopped = true;
    win.clearTimeout(timer);
    doc?.removeEventListener?.("visibilitychange", resume);
    win.removeEventListener?.("focus", resume);
    win.removeEventListener?.("online", resume);
  };
}
