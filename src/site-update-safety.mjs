export const SITE_UPDATE_SETTLE_MS = 2000;

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ignoredWrite = () => false;

// Only request saves belong to this guard. Background heartbeats, activity
// reports and unrelated applications must not indefinitely postpone an update.
export function requestWriteKey(input, init, origin = globalThis.location?.origin) {
  const method = String(init?.method || input?.method || "GET").toUpperCase();
  if (!writeMethods.has(method)) return "";
  const value = typeof input === "string" ? input : input?.url || input?.href || "";
  if (!value) return "";
  try {
    const base = origin || "https://request-write.invalid";
    const url = new URL(value, base);
    if (url.origin !== base || !/^\/api\/requests(?:\/|$)/.test(url.pathname)) return "";
    return `${method} ${url.pathname}`;
  } catch {
    return "";
  }
}

export function createSiteUpdateSafety({ now = () => Date.now(), settleMs = SITE_UPDATE_SETTLE_MS, origin } = {}) {
  const grace = Number.isFinite(settleMs) && settleMs >= 0 ? settleMs : SITE_UPDATE_SETTLE_MS;
  const pending = new Set();
  const failed = new Set();
  let nextId = 0;
  let settleUntil = 0;

  // Explicit leases can cover parsing, uncertain-write recovery and UI state
  // updates as well as the network call. Nested/overlapping leases are safe.
  const beginWrite = () => {
    const id = ++nextId;
    pending.add(id);
    let released = false;
    return ({ ok = false } = {}) => {
      if (released) return false;
      released = true;
      pending.delete(id);
      if (!ok) failed.add(id);
      settleUntil = Math.max(settleUntil, now() + grace);
      return true;
    };
  };

  const getState = (deadline) => {
    const at = now();
    const hasDeadline = Number.isFinite(deadline);
    const remainingSeconds = hasDeadline ? Math.max(0, Math.ceil((deadline - at) / 1000)) : null;
    const pendingCount = pending.size;
    const failedCount = failed.size;
    const settled = at >= settleUntil;
    const canRefreshNow = pendingCount === 0 && settled;
    const canRefresh = hasDeadline && remainingSeconds === 0 && canRefreshNow && failedCount === 0;
    const reason = pendingCount ? "saving"
      : failedCount ? "save-failed"
        : !settled ? "settling"
          : !hasDeadline ? "waiting"
            : remainingSeconds > 0 ? "countdown" : "ready";
    return { pendingCount, failedCount, settleUntil, settled, remainingSeconds, canRefreshNow, canRefresh, reason };
  };

  return {
    beginWrite,
    async runWrite(operation) {
      const finish = beginWrite();
      try {
        const result = await operation();
        finish({ok: true});
        return result;
      } finally {
        finish();
      }
    },
    beginApiWrite(input, init) {
      return requestWriteKey(input, init, origin) ? beginWrite() : ignoredWrite;
    },
    getState,
    // A successful later save cannot establish whether an earlier failed write
    // was recovered. Only explicit acknowledgement releases that hold.
    acknowledgeFailures() {
      if (!getState().canRefreshNow) return false;
      failed.clear();
      return true;
    },
  };
}

export const siteUpdateSafety = createSiteUpdateSafety();
