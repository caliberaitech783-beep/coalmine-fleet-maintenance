/**
 * Translates an error that escaped a route into the HTTP response the app
 * should send. Before this module every unexpected error became a bare
 * HTTP 500 "Server error", including the ordinary connection drops that
 * happen while PostgreSQL restarts or a deployment swaps slots, and the
 * validation errors that routes raise with an explicit status. Users saw
 * "Server error" for conditions that were temporary or their own input.
 */

export const TRANSIENT_DATABASE_MESSAGE = 'The server is reconnecting to the database. Please retry in a moment.';
export const REQUEST_REJECTED_MESSAGE = 'The request could not be read. Please refresh and try again.';
export const UNEXPECTED_ERROR_MESSAGE = 'Something went wrong on the server. Please retry; if this keeps happening, contact the administrator.';
export const TRANSIENT_RETRY_AFTER_SECONDS = 5;

// PostgreSQL SQLSTATE codes that mean "the database is unavailable right now",
// not "the query is wrong": connection exceptions (class 08), operator
// intervention such as admin_shutdown / cannot_connect_now (class 57),
// insufficient resources such as too_many_connections (class 53), and
// serialization or deadlock failures that succeed when replayed (class 40).
const TRANSIENT_SQLSTATE_PREFIXES = ['08', '57', '53', '40'];
const TRANSIENT_SYSTEM_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH',
  'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_SOCKET_CLOSED', 'ERR_STREAM_DESTROYED',
]);
const TRANSIENT_MESSAGE_PATTERNS = [
  /connection terminated/i,
  /connection ended unexpectedly/i,
  /server closed the connection unexpectedly/i,
  /client has encountered a connection error/i,
  /timeout exceeded when trying to connect/i,
  /the database system is (?:starting up|shutting down|in recovery mode)/i,
  /terminating connection due to administrator command/i,
  /remaining connection slots are reserved/i,
  /too many clients already/i,
  /could not connect to server/i,
  /connection is closed/i,
  /pool is draining/i,
];

export function isTransientDatabaseError(error) {
  if (!error || typeof error !== 'object') return false;
  const code = String(error.code || '');
  if (TRANSIENT_SYSTEM_CODES.has(code)) return true;
  if (/^[0-9A-Z]{5}$/.test(code) && TRANSIENT_SQLSTATE_PREFIXES.some((prefix) => code.startsWith(prefix))) return true;
  const message = String(error.message || '');
  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function explicitStatus(error) {
  const status = Number(error?.status ?? error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 0;
}

/**
 * Returns {status, body, retryAfterSeconds} for an error caught by the
 * application-wide error handler. The body is always JSON with an `error`
 * string so every client code path that reads `data.error` keeps working.
 */
export function describeServerError(error) {
  if (error?.type === 'entity.too.large') {
    return { status: 413, body: { error: 'The CSV is too large to import. Split it into smaller files.' } };
  }
  if (isTransientDatabaseError(error)) {
    return {
      status: 503,
      retryAfterSeconds: TRANSIENT_RETRY_AFTER_SECONDS,
      body: { error: TRANSIENT_DATABASE_MESSAGE, transient: true },
    };
  }
  const status = explicitStatus(error);
  if (status >= 400 && status < 500) {
    // Body parser and route validation errors carry their own status. Route
    // errors are written for users; parser errors are not, so those get a
    // stable message instead of a JSON tokenizer complaint.
    const fromBodyParser = typeof error.type === 'string' && error.type.length > 0;
    const body = { error: fromBodyParser ? REQUEST_REJECTED_MESSAGE : String(error.message || REQUEST_REJECTED_MESSAGE) };
    if (error.code && !fromBodyParser) body.code = error.code;
    return { status, body };
  }
  return { status: 500, body: { error: UNEXPECTED_ERROR_MESSAGE } };
}

/** Express error middleware built on describeServerError. */
export function serverErrorHandler({ log = console.error } = {}) {
  return (error, req, res, _next) => {
    const described = describeServerError(error);
    log(`[${described.status}] ${req?.method || ''} ${req?.originalUrl || req?.url || ''}`, error);
    if (res.headersSent) return;
    if (described.retryAfterSeconds) res.set('Retry-After', String(described.retryAfterSeconds));
    res.status(described.status).json(described.body);
  };
}
