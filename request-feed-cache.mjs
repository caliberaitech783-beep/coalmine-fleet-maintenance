// Every signed-in workspace polls the request feed every few seconds, and each
// poll used to read the whole maintenance_requests table and its daily remarks
// again. This holds one reader's result for a very short window so the polls
// that land in that window share it. Business writes clear the window immediately,
// so a user never sees their own change missing from the next refresh.

// Only a write that can change what the feed returns closes the window: maintenance requests
// (with their remarks, first-trip acceptances, corrections and archives), master data (users,
// privileges, equipment, vehicle transfers, Oracle synchronisation), the C-Dir employee records,
// password and language changes to a user's record, and the purges and restores that rewrite
// those tables. Every other write (sign-in, heartbeat, activity, notifications, CRM tickets,
// Telegram, remote assistance, announcements, settings, exports) leaves the window open. A
// Telegram link is also noted on the user's record, but no held record reads those fields.
//
// Until 10 Nov 2026 every write except three closed the window. The Pulse-II bridge reads the
// feed and the fleet through a POST (/api/integrations/mis/pulse), so each of its reads during
// a scanning burst emptied the very caches meant to answer it; the bridge's own verification
// write closes the windows where it is wired in server.mjs. The database also keeps a revision
// per feed (data_revisions, bumped by triggers on these tables) that the request feed checks on
// every poll, so a change from any path is never served stale beyond that poll.
const FEED_WRITE_ROUTES = [
  '/api/requests', '/api/request-corrections', '/api/request-archives',
  '/api/masters', '/api/vehicle-transfers', '/api/oracle',
  '/api/cdir', '/api/change-initial-password', '/api/password-reset', '/api/preferred-language',
  '/api/data-housekeeping', '/api/deletion-approvals', '/api/backups/import', '/api/selective-media',
];

export function requestFeedWriteInvalidates({method, path} = {}) {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const route = String(path || '');
  return FEED_WRITE_ROUTES.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

export function createFeedCache({ttlMs = 30_000, now = Date.now} = {}) {
  const entries = new Map();
  let hits = 0;
  let reads = 0;

  function clear() {
    entries.clear();
  }

  function read(load, revision = '', feed = 'workflow') {
    const time = now();
    const entry = entries.get(feed);
    if (entry && entry.revision === revision && (entry.pending || entry.expiresAt > time)) {
      hits += 1;
      return entry.promise;
    }
    reads += 1;
    const promise = Promise.resolve().then(load);
    const candidate = {expiresAt: time + ttlMs, promise, revision, pending: true};
    entries.set(feed, candidate);
    // A failed read must not be served to the next caller, and its rejection is
    // reported to whoever asked for it, never as an unhandled rejection here.
    promise.then(() => {
      candidate.pending = false;
      candidate.expiresAt = now() + ttlMs;
    }, () => {
      if (entries.get(feed) === candidate) entries.delete(feed);
    });
    return promise;
  }

  return {
    read,
    clear,
    get stats() {
      return {hits, reads, cached: entries.size > 0};
    },
  };
}
