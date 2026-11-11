/** Share bursts of activity writes while allowing a failed write to be retried. */
export function coalesceSessionActivity({now = Date.now, intervalMs = 5_000, maxRecent = 4_096} = {}) {
  const pending = new Map();
  const recent = new Map();
  return (sessionId, write) => {
    if (pending.has(sessionId)) return pending.get(sessionId);
    const startedAt = now();
    if (startedAt - (recent.get(sessionId) ?? -Infinity) < intervalMs) return Promise.resolve();
    const operation = Promise.resolve().then(write).then(() => {
      recent.delete(sessionId);
      recent.set(sessionId, startedAt);
      if (recent.size > maxRecent) recent.delete(recent.keys().next().value);
    }).finally(() => pending.delete(sessionId));
    pending.set(sessionId, operation);
    return operation;
  };
}
