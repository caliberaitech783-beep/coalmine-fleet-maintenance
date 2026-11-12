import zlib from 'node:zlib';
import {promisify} from 'node:util';

// On 13 Nov 2026 the Dashboard request feed was 21,061 rows and 44.7 MB of JSON. Every poll that
// followed a change filtered those rows, serialised them and compressed them again for each
// signed-in user, although users with the same role and site scope receive identical bytes.
// Serialising alone holds the event loop for most of a second at that size, so a change seen by
// thirty open Dashboards stalled every other request behind it.
//
// This holds the serialised body, and its compressed forms, for the rows object the request feed
// cache handed out. Callers with the same variant (feed, role, site scope) share one body. An
// entry is used only while the feed cache still returns the same rows object, so it can never
// outlive the read it was built from: a new read, for a write or an elapsed window, is a new
// object and builds a new body.

const brotliCompress = promisify(zlib.brotliCompress);
const gzipCompress = promisify(zlib.gzip);

const defaultEncoders = {
  // Quality 4 is what the compression middleware uses for streamed responses.
  br: (body) => brotliCompress(body, {params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
  }}),
  gzip: (body) => gzipCompress(body),
};

export function createSharedFeedResponses({
  maxBytes = 192 * 1024 * 1024,
  idleMs = 90_000,
  now = Date.now,
  encoders = defaultEncoders,
} = {}) {
  const entries = new Map();
  let builds = 0;
  let reuses = 0;

  const entryBytes = (entry) => entry.body.length + [...entry.sizes.values()].reduce((total, size) => total + size, 0);

  function prune(keep) {
    const time = now();
    for (const [key, entry] of entries) {
      if (entry !== keep && time - entry.usedAt > idleMs) entries.delete(key);
    }
    let total = 0;
    for (const entry of entries.values()) total += entryBytes(entry);
    // Least recently used first; the entry being served is never dropped.
    for (const [key, entry] of [...entries].sort((a, b) => a[1].usedAt - b[1].usedAt)) {
      if (total <= maxBytes) break;
      if (entry === keep) continue;
      entries.delete(key);
      total -= entryBytes(entry);
    }
  }

  // `source` is the rows object from the feed cache; `build` returns what this variant may see.
  function body(source, variant, build) {
    if (!source || typeof source !== 'object') throw new TypeError('A shared feed response needs the rows object it was built from.');
    const key = String(variant);
    let entry = entries.get(key);
    if (entry && entry.source === source) {
      reuses += 1;
    } else {
      builds += 1;
      entry = {source, body: Buffer.from(JSON.stringify(build())), encoded: new Map(), sizes: new Map(), usedAt: now()};
      entries.set(key, entry);
    }
    entry.usedAt = now();
    prune(entry);
    return entry;
  }

  // One compression per entry and encoding, shared by every caller that asks while it runs.
  function encoded(entry, encoding) {
    const encode = encoders[encoding];
    if (!encode) return Promise.resolve(null);
    let pending = entry.encoded.get(encoding);
    if (!pending) {
      pending = Promise.resolve().then(() => encode(entry.body)).then((buffer) => {
        entry.sizes.set(encoding, buffer.length);
        return buffer;
      });
      entry.encoded.set(encoding, pending);
      // A failed compression is not kept; the caller falls back to the plain body.
      pending.catch(() => { if (entry.encoded.get(encoding) === pending) entry.encoded.delete(encoding); });
    }
    return pending;
  }

  return {
    body,
    encoded,
    clear() { entries.clear(); },
    get stats() {
      let bytes = 0;
      for (const entry of entries.values()) bytes += entryBytes(entry);
      return {builds, reuses, entries: entries.size, bytes};
    },
  };
}

// Sends a shared body with the caller's own ETag. The compressed form is chosen from the
// request's Accept-Encoding exactly as the compression middleware would choose it, and the
// middleware leaves a response alone once Content-Encoding is set.
export async function sendSharedFeedJson(req, res, responses, {source, variant, build, etag, setHeaders = () => {}}) {
  const entry = responses.body(source, variant, build);
  setHeaders(res, etag);
  res.set('X-Payload-Bytes', String(entry.body.length));
  res.type('application/json');
  res.vary('Accept-Encoding');
  // Browsers list gzip before br at equal weight; br is smaller, so it is preferred when offered.
  const accepts = (name) => typeof req.acceptsEncodings === 'function' && req.acceptsEncodings(name) === name;
  const encoding = accepts('br') ? 'br' : accepts('gzip') ? 'gzip' : false;
  if (encoding === 'br' || encoding === 'gzip') {
    try {
      const compressed = await responses.encoded(entry, encoding);
      if (compressed) {
        res.set('Content-Encoding', encoding);
        return res.send(compressed);
      }
    } catch {
      // Fall through: the middleware compresses the plain body as before.
    }
  }
  return res.send(entry.body);
}
