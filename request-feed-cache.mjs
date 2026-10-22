// Every signed-in workspace polls the request feed every few seconds, and each
// poll used to read the whole maintenance_requests table and its daily remarks
// again. This holds one reader's result for a very short window so the polls
// that land in that window share it. Business writes clear the window immediately,
// so a user never sees their own change missing from the next refresh.

// These exact POST routes update only session/activity telemetry, not requests,
// remarks, first-trip acceptance or master data. Unknown writes remain invalidating.
export function requestFeedWriteInvalidates({method, path} = {}) {
  if (method === 'GET' || method === 'HEAD') return false;
  return !(method === 'POST' && ['/api/session-heartbeat', '/api/user-activity'].includes(path));
}

export function createFeedCache({ttlMs = 30_000, now = Date.now} = {}) {
  let entry = null;
  let hits = 0;
  let reads = 0;

  function clear() {
    entry = null;
  }

  function read(load, revision = '') {
    const time = now();
    if (entry && entry.revision === revision && (entry.pending || entry.expiresAt > time)) {
      hits += 1;
      return entry.promise;
    }
    reads += 1;
    const promise = Promise.resolve().then(load);
    const candidate = {expiresAt: time + ttlMs, promise, revision, pending: true};
    entry = candidate;
    // A failed read must not be served to the next caller, and its rejection is
    // reported to whoever asked for it, never as an unhandled rejection here.
    promise.then(() => {
      candidate.pending = false;
      candidate.expiresAt = now() + ttlMs;
    }, () => {
      if (entry === candidate) clear();
    });
    return promise;
  }

  return {
    read,
    clear,
    get stats() {
      return {hits, reads, cached: Boolean(entry)};
    },
  };
}
