import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {authenticatedApiRequest, createSessionExpiryGuard, removeMatchingStoredSession} from "../src/session-expiry-guard.mjs";
import {fetchWithTransientRetry} from "../src/api-transient-retry.mjs";
import {edgeSafeJsonInit} from "../request-body-transport.mjs";
import {createSiteUpdateSafety} from "../src/site-update-safety.mjs";

const origin = "https://pulse.cmll.in";
const token = "current-token";
const headers = {Authorization: `Bearer ${token}`};
const expired = () => Response.json({error: "Your sign-in has expired. Please sign in again."}, {status: 401});
const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve}; };

function fixture(fetch, options = {}) {
  let activeToken = token;
  const expiredTokens = [];
  const guard = createSessionExpiryGuard({
    fetch, getToken: () => activeToken, onExpired: value => expiredTokens.push(value), ...options,
  });
  return {guard, expiredTokens, setToken: value => {activeToken = value;}};
}

test("only the active credential sent to this origin can trigger session validation", () => {
  const capture = (input, init) => authenticatedApiRequest(input, init, {origin, token});
  for (const input of ["/api/requests", `${origin}/api/requests`, new URL(`${origin}/api/requests`), new Request(`${origin}/api/requests`, {headers})]) {
    assert.deepEqual(capture(input, {headers}), {token});
  }
  assert.deepEqual(capture(new Request(`${origin}/api/requests`, {headers})), {token});
  for (const input of ["/api/app-version", "/api/change-initial-password"]) assert.equal(capture(input), null);
  for (const input of ["https://other.example/api/requests", "//other.example/api/requests", "/api/login", "/api/login/otp", "/not-api"]) {
    assert.equal(capture(input, {headers}), null);
  }
  assert.equal(capture("/api/requests", {headers: {Authorization: "Bearer old-token"}}), null);
  assert.equal(capture(new Request(`${origin}/api/requests`, {headers}), {headers: {}}), null);
});

test("a feature's 401 leaves a canonically valid session intact and preserves the original body", async () => {
  const calls = [];
  const f = fixture(async (...args) => {calls.push(args); return new Response(null, {status: 204});});
  const original = Response.json({error: "Feature-specific error"}, {status: 401});
  assert.equal(await f.guard.check(original, {token}), false);
  assert.deepEqual(await original.json(), {error: "Feature-specific error"});
  assert.deepEqual(f.expiredTokens, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/session-heartbeat");
  assert.equal(calls[0][1].method, "POST");
  assert.equal(calls[0][1].headers.Authorization, headers.Authorization);
  assert.equal(calls[0][1].redirect, "error");
});

test("only an explicit canonical rejection expires the unchanged current token", async () => {
  const f = fixture(async () => expired());
  assert.equal(await f.guard.check(expired(), {token}), true);
  assert.equal(await f.guard.check(expired(), {token}), false);
  assert.deepEqual(f.expiredTokens, [token]);
});

test("public, foreign, successful and stale-token responses never validate or expire", async () => {
  let calls = 0;
  const f = fixture(async () => {calls++; return expired();});
  await f.guard.check(expired(), null);
  await f.guard.check(new Response(null, {status: 200}), {token});
  await f.guard.check(expired(), {token: "old-token"});
  assert.equal(calls, 0);
  assert.deepEqual(f.expiredTokens, []);
});

test("parallel unauthorized responses share one validation, including a login change during validation", async () => {
  const wait = deferred();
  let calls = 0;
  const f = fixture(async () => {calls++; return wait.promise;});
  const pending = [f.guard.check(expired(), {token}), f.guard.check(expired(), {token})];
  assert.equal(calls, 1);
  f.setToken("new-token");
  wait.resolve(expired());
  assert.deepEqual(await Promise.all(pending), [false, false]);
  assert.deepEqual(f.expiredTokens, []);
});

test("coalesced genuine expiry notifies only once", async () => {
  const wait = deferred();
  const f = fixture(async () => wait.promise);
  const pending = [f.guard.check(expired(), {token}), f.guard.check(expired(), {token})];
  wait.resolve(expired());
  await Promise.all(pending);
  assert.deepEqual(f.expiredTokens, [token]);
});

test("network, gateway, malformed, redirected and unrelated validation failures preserve login", async () => {
  const responses = [
    () => {throw new TypeError("Failed to fetch");},
    () => new Response(null, {status: 503}),
    () => new Response("Gateway denied", {status: 401, headers: {"content-type": "text/html"}}),
    () => new Response("{", {status: 401, headers: {"content-type": "application/json"}}),
    () => Response.json({error: "Another credential was rejected"}, {status: 401}),
    () => {const r = expired(); Object.defineProperty(r, "redirected", {value: true}); return r;},
  ];
  for (const response of responses) {
    const f = fixture(async () => response());
    assert.equal(await f.guard.check(expired(), {token}), false);
    assert.deepEqual(f.expiredTokens, []);
  }
});

test("validation timeout does not expire and a later check can still detect revocation", async () => {
  let calls = 0;
  const f = fixture(async (_url, init) => {
    if (++calls > 1) return expired();
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true}));
  }, {timeoutMs: 5});
  assert.equal(await f.guard.check(expired(), {token}), false);
  assert.deepEqual(f.expiredTokens, []);
  assert.equal(await f.guard.check(expired(), {token}), true);
});

test("expiry cannot remove a newer login saved by another tab", () => {
  let value = JSON.stringify({token: "new-token"});
  const storage = {getItem: () => value, removeItem: () => {value = null;}};
  removeMatchingStoredSession(storage, token);
  assert.equal(JSON.parse(value).token, "new-token");
  removeMatchingStoredSession(storage, "new-token");
  assert.equal(value, null);
  assert.doesNotThrow(() => removeMatchingStoredSession({getItem: () => {throw Error("Unavailable");}}, token));
});

test("the actual fetch interceptor never replays a completed save or logs out for an unrelated background 401", async () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const wrapper = source.slice(source.indexOf('if (typeof window !== "undefined" && typeof window.fetch'), source.indexOf("const subsidiaryData"));
  const calls = [], redirects = [], cleared = [];
  const context = {
    authToken: token, clientDeviceId: "device-test", SESSION_EXPIRED_PARAM: "session-expired",
    authenticatedApiRequest, createSessionExpiryGuard, fetchWithTransientRetry, edgeSafeJsonInit,
    siteUpdateSafety: createSiteUpdateSafety({origin}),
    Headers, Request, console,
    clearStoredSession: value => cleared.push(value),
    window: {location: {origin, replace: value => redirects.push(value)}, fetch: async (url, init) => {
      calls.push([url, init]);
      if (url === "/api/requests/REQ-TEST/close") return Response.json({ref: "REQ-TEST", status: "Closed"});
      if (url === "/api/session-heartbeat") return new Response(null, {status: 204});
      return expired();
    }},
  };
  vm.runInNewContext(wrapper, context);
  const saved = await context.window.fetch("/api/requests/REQ-TEST/close", {method: "PATCH", headers});
  assert.equal((await saved.json()).status, "Closed");
  await context.window.fetch("/api/notifications", {headers});
  await context.window.fetch("/api/app-version");
  assert.equal(calls.filter(([url]) => url.includes("/close")).length, 1);
  assert.equal(calls.filter(([url]) => url === "/api/session-heartbeat").length, 1);
  assert.deepEqual(cleared, []);
  assert.deepEqual(redirects, []);
});
