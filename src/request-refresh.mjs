export const REQUEST_CHANGE_STORAGE_KEY = "bdms:requests:changed";

// Invalidate other tabs without copying records, account identifiers or credentials.
export function notifyRequestChange(win = globalThis.window) {
  try {
    win.localStorage.setItem(REQUEST_CHANGE_STORAGE_KEY, `${Date.now()}:${Math.random().toString(36).slice(2)}`);
    return true;
  } catch {
    // Storage may be disabled; visible tabs still refresh on their regular timer.
    return false;
  }
}

// Keep the shared request list fresh without concurrent refreshes or event bursts.
// The caller owns cancellation/stale-response protection for an in-flight fetch.
export function watchRequestRefresh(refresh, {
  win = globalThis.window,
  doc = win?.document,
  intervalMs = 10_000,
  now = Date.now,
  burstMs = 1_000,
  initial = false,
  onError,
} = {}) {
  if (!win || !doc) return () => {};
  let disposed = false;
  let running = false;
  let queued = false;
  let lastResume = -Infinity;
  const visible = () => doc.visibilityState !== "hidden";
  const revalidate = async () => {
    if (disposed || !visible()) return;
    if (running) { queued = true; return; }
    running = true;
    queued = false;
    try {
      await refresh();
    } catch (error) {
      // A transient error must not stop later refreshes or reject an event handler.
      try { onError?.(error); } catch {}
    } finally {
      running = false;
      if (queued && !disposed && visible()) void revalidate();
    }
  };
  const resume = () => {
    if (disposed || !visible()) return;
    const currentTime = now();
    // Returning to a tab often emits pageshow, visibilitychange and focus together.
    if (!queued && currentTime >= lastResume && currentTime - lastResume < burstMs) return;
    lastResume = currentTime;
    void revalidate();
  };
  const visibilityChanged = () => {
    if (!visible()) { lastResume = -Infinity; return; }
    resume();
  };
  const changedElsewhere = (event) => {
    if (disposed || event.key !== REQUEST_CHANGE_STORAGE_KEY || !event.newValue) return;
    // Do not debounce mutations: one that arrives during a fetch needs a follow-up.
    if (!visible()) { queued = true; return; }
    void revalidate();
  };
  const resumeEvents = ["focus", "pageshow", "online"];
  for (const name of resumeEvents) win.addEventListener(name, resume);
  doc.addEventListener("visibilitychange", visibilityChanged);
  win.addEventListener("storage", changedElsewhere);
  const timer = win.setInterval(() => { void revalidate(); }, intervalMs);
  if (initial) void revalidate();
  return () => {
    disposed = true;
    queued = false;
    for (const name of resumeEvents) win.removeEventListener(name, resume);
    doc.removeEventListener("visibilitychange", visibilityChanged);
    win.removeEventListener("storage", changedElsewhere);
    win.clearInterval(timer);
  };
}
