import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  fetchWithTransientRetry,
  isNetworkFailure,
  retryDelayMs,
  shouldRetryResponse,
  RETRY_DELAYS_MS,
} from "../src/api-transient-retry.mjs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

function response(status, headers = {}) {
  return { status, ok: status >= 200 && status < 300, headers: { get: (name) => headers[name.toLowerCase()] || "" } };
}

function scriptedFetch(outcomes) {
  const calls = [];
  const fetcher = async (input, init) => {
    calls.push({ input, init });
    const next = outcomes.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetcher, calls };
}

const instantSleep = { sleep: async () => {} };

test("read-only API calls retry through a restart and return the first healthy response", async () => {
  const { fetcher, calls } = scriptedFetch([response(503, { "retry-after": "2" }), response(502), Object.assign(new TypeError("Failed to fetch")), response(200)]);
  const slept = [];
  const result = await fetchWithTransientRetry(fetcher, "/api/requests?t=1", { headers: {} }, { sleep: async (ms) => { slept.push(ms); } });
  assert.equal(result.status, 200);
  assert.equal(calls.length, 4);
  assert.deepEqual(slept, [2000, RETRY_DELAYS_MS[1], RETRY_DELAYS_MS[2]]);
});

test("retries stop after the schedule is exhausted and the last response is returned", async () => {
  const outcomes = Array.from({ length: RETRY_DELAYS_MS.length + 1 }, () => response(503));
  const { fetcher, calls } = scriptedFetch(outcomes);
  const result = await fetchWithTransientRetry(fetcher, "/api/info-pulse", {}, instantSleep);
  assert.equal(result.status, 503);
  assert.equal(calls.length, RETRY_DELAYS_MS.length + 1);
});

test("writes are never replayed and non-API or non-transient responses pass straight through", async () => {
  for (const [input, init, status] of [
    ["/api/requests", { method: "POST" }, 503],
    ["/api/requests/1/close", { method: "PATCH" }, 502],
    ["/api/masters/x/1", { method: "DELETE" }, 504],
    ["/assets/app.js", {}, 503],
    ["/api/requests", {}, 500],
    ["/api/requests", {}, 401],
  ]) {
    const { fetcher, calls } = scriptedFetch([response(status), response(200)]);
    const result = await fetchWithTransientRetry(fetcher, input, init, instantSleep);
    assert.equal(result.status, status, `${init.method || "GET"} ${input}`);
    assert.equal(calls.length, 1);
  }
  const { fetcher, calls } = scriptedFetch([new TypeError("Failed to fetch")]);
  await assert.rejects(fetchWithTransientRetry(fetcher, "/api/requests", { method: "POST", body: "{}" }, instantSleep), /Failed to fetch/);
  assert.equal(calls.length, 1);
});

test("an aborted request is not retried", async () => {
  const controller = new AbortController();
  const { fetcher, calls } = scriptedFetch([response(503), response(200)]);
  controller.abort();
  const result = await fetchWithTransientRetry(fetcher, "/api/masters", { signal: controller.signal }, instantSleep);
  assert.equal(result.status, 503);
  assert.equal(calls.length, 1);
  const abortError = Object.assign(new Error("The user aborted a request."), { name: "AbortError" });
  assert.equal(isNetworkFailure(abortError), false);
  assert.equal(isNetworkFailure(new TypeError("Failed to fetch")), true);
});

test("delays honour Retry-After within a bound and fall back to the schedule", () => {
  assert.equal(retryDelayMs(0), RETRY_DELAYS_MS[0]);
  assert.equal(retryDelayMs(99), RETRY_DELAYS_MS.at(-1));
  assert.equal(retryDelayMs(0, "5"), 5000);
  assert.equal(retryDelayMs(0, "600"), 8000);
  assert.equal(retryDelayMs(1, "garbage"), RETRY_DELAYS_MS[1]);
  assert.equal(shouldRetryResponse({ method: "GET", status: 503, attempt: 0 }), true);
  assert.equal(shouldRetryResponse({ method: "GET", status: 503, attempt: RETRY_DELAYS_MS.length }), false);
  assert.equal(shouldRetryResponse({ method: "POST", status: 503, attempt: 0 }), false);
});

test("the application fetch interceptor routes API calls through the transient retry", () => {
  assert.match(main, /import \{fetchWithTransientRetry\} from "\.\/api-transient-retry\.mjs";/);
  assert.match(main, /window\.__sessionExpiryFetch = true;[\s\S]*fetchWithTransientRetry\(nativeFetch, input, requestInit/);
});
