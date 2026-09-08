// Other accounts can update masters while an authenticated view remains mounted.
// Revalidate when returning to that view, and periodically only while it is visible.
export function watchVisibleMasterRefresh(refresh, {win, doc, intervalMs = 60_000, now = Date.now}) {
  let disposed = false;
  let lastRefresh = -Infinity;
  const revalidate = () => {
    if (disposed || doc.visibilityState === "hidden") return;
    const currentTime = now();
    // Browsers usually fire both visibilitychange and focus when returning to a tab.
    if (currentTime - lastRefresh < 1_000) return;
    lastRefresh = currentTime;
    refresh();
  };
  win.addEventListener("focus", revalidate);
  doc.addEventListener("visibilitychange", revalidate);
  const timer = win.setInterval(revalidate, intervalMs);
  return () => {
    disposed = true;
    win.removeEventListener("focus", revalidate);
    doc.removeEventListener("visibilitychange", revalidate);
    win.clearInterval(timer);
  };
}
