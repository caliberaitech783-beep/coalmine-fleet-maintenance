// Every signed-in workspace polls the request feed every few seconds, and each
// poll used to read the whole maintenance_requests table and its daily remarks
// again. This holds one reader's result for a very short window so the polls
// that land in that window share it. Any write clears the window immediately,
// so a user never sees their own change missing from the next refresh.

export function createFeedCache({ttlMs = 3000, now = Date.now} = {}) {
  let entry = null;
  let hits = 0;
  let reads = 0;

  function clear() {
    entry = null;
  }

  function read(load) {
    const time = now();
    if (entry && entry.expiresAt > time) {
      hits += 1;
      return entry.promise;
    }
    reads += 1;
    const promise = Promise.resolve().then(load);
    entry = {expiresAt: time + ttlMs, promise};
    // A failed read must not be served to the next caller, and its rejection is
    // reported to whoever asked for it, never as an unhandled rejection here.
    promise.catch(() => {
      if (entry && entry.promise === promise) clear();
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
