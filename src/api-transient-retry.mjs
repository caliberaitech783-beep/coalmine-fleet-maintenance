/**
 * Retries read-only API calls that fail for reasons that resolve on their
 * own: the app restarting after a deployment, the edge gateway returning
 * 502/503/504 while the origin warms up, or a dropped connection. Writes
 * (POST/PUT/PATCH/DELETE) are never replayed here because the server may
 * already have applied them; those keep surfacing the server's message.
 */

export const TRANSIENT_STATUSES = new Set([408, 425, 429, 502, 503, 504]);
export const RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 8000];
export const MAX_RETRY_AFTER_MS = 8000;
export const TRANSIENT_NETWORK_MESSAGE = "The connection to the server was interrupted. Please check the network and try again.";

export function requestMethod(input, init) {
  const explicit = init?.method || (input && typeof input === "object" ? input.method : "");
  return String(explicit || "GET").toUpperCase();
}

export function isApiUrl(input) {
  const url = typeof input === "string" ? input : (input && typeof input === "object" ? input.url : "") || "";
  return url.startsWith("/api/");
}

export function isReadOnlyMethod(method) {
  return method === "GET" || method === "HEAD";
}

export function isTransientStatus(status) {
  return TRANSIENT_STATUSES.has(Number(status));
}

export function isNetworkFailure(error) {
  if (!error || typeof error !== "object") return false;
  if (error.name === "AbortError") return false;
  return error.name === "TypeError" || /failed to fetch|networkerror|load failed|network request failed/i.test(String(error.message || ""));
}

/** Milliseconds to wait before `attempt` (0-based) is retried. */
export function retryDelayMs(attempt, retryAfterHeader = "") {
  const fallback = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
  const seconds = Number(String(retryAfterHeader || "").trim());
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  return fallback;
}

/** Whether a response should be retried for `attempt` (0-based) of a read-only request. */
export function shouldRetryResponse({ method, status, attempt }) {
  return isReadOnlyMethod(method) && isTransientStatus(status) && attempt < RETRY_DELAYS_MS.length;
}

function readRetryAfter(response) {
  try {
    return response?.headers?.get?.("retry-after") || "";
  } catch {
    return "";
  }
}

function aborted(init) {
  return Boolean(init?.signal?.aborted);
}

/**
 * Calls `performFetch(input, init)` and retries transient failures of
 * read-only /api requests. Resolves with the final response, or rejects with
 * the final error once retries are exhausted or the request was aborted.
 */
export async function fetchWithTransientRetry(performFetch, input, init, { sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), onRetry = () => {} } = {}) {
  const method = requestMethod(input, init);
  const retryable = isApiUrl(input) && isReadOnlyMethod(method);
  let attempt = 0;
  for (;;) {
    let response;
    try {
      response = await performFetch(input, init);
    } catch (error) {
      if (!retryable || !isNetworkFailure(error) || attempt >= RETRY_DELAYS_MS.length || aborted(init)) throw error;
      onRetry({ attempt, reason: "network", error });
      await sleep(retryDelayMs(attempt));
      attempt += 1;
      continue;
    }
    if (!retryable || !shouldRetryResponse({ method, status: response.status, attempt }) || aborted(init)) return response;
    onRetry({ attempt, reason: "status", status: response.status });
    await sleep(retryDelayMs(attempt, readRetryAfter(response)));
    attempt += 1;
  }
}
