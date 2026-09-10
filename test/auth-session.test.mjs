import assert from "node:assert/strict";
import test from "node:test";
import {createSessionStore} from "../auth-session.mjs";

test("stores login sessions in PostgreSQL", async () => {
  const calls = [];
  const store = createSessionStore({
    async query(sql, params) {
      calls.push({sql, params});
      return {rows: []};
    }
  });

  await store.create({
    token: "token-1", role: "normal", name: "Anoop Paul", login: "anoop",
    userType: "Mobile User", assignedRole: "Production User", permissions: {createRequests: true},
  });

  assert.match(calls[0].sql, /DELETE FROM auth_sessions/);
  assert.deepEqual(calls[0].params, [30, 15]);
  assert.match(calls[1].sql, /INSERT INTO auth_sessions/);
  assert.deepEqual(calls[1].params, ["token-1", "normal", "Anoop Paul", "anoop", "Mobile User", "Production User", '{"createRequests":true}']);
});

test("loads an existing session from PostgreSQL", async () => {
  const store = createSessionStore({
    async query(sql, params) {
      assert.match(sql, /FROM auth_sessions/);
      assert.match(sql, /created_at > NOW\(\) - make_interval\(days => \$2::int\)/);
      assert.match(sql, /last_seen_at > NOW\(\) - make_interval\(mins => \$3::int\)/);
      assert.deepEqual(params, ["token-1", 30, 15]);
      return {rows: [{role: "normal", name: "Anoop Paul", login: "anoop", userType: "Mobile User", assignedRole: "MIS User", permissions: {verifyRequests: true}}]};
    }
  });

  assert.deepEqual(await store.get("token-1"), {role: "normal", name: "Anoop Paul", login: "anoop", userType: "Mobile User", assignedRole: "MIS User", permissions: {verifyRequests: true}});
});

test("supports a bounded custom server-side session lifetime", async () => {
  const calls = [];
  const store = createSessionStore({
    async query(sql, params) {
      calls.push({sql, params});
      return {rows: []};
    }
  }, {maxAgeDays: 7, idleTimeoutMinutes: 12});

  assert.equal(await store.get("token-2"), null);
  assert.deepEqual(calls[0].params, ["token-2", 7, 12]);
});

test("does not query PostgreSQL when no token is supplied", async () => {
  const store = createSessionStore({
    async query() {
      assert.fail("query should not be called");
    }
  });

  assert.equal(await store.get(""), null);
});

test("records session activity without changing the session token", async () => {
  const calls = [];
  const store = createSessionStore({
    async query(sql, params) {
      calls.push({sql, params});
      return {rows: []};
    }
  });

  await store.touch("token-3", {
    ipAddress: "10.0.0.8",
    deviceId: "BDMS-DEVICE01",
    userAgent: "Test Browser",
  });

  assert.match(calls[0].sql, /UPDATE auth_sessions/);
  assert.match(calls[0].sql, /last_seen_at = NOW\(\)/);
  assert.match(calls[0].sql, /last_seen_at > NOW\(\) - make_interval\(mins => \$5::int\)/);
  assert.deepEqual(calls[0].params, ["token-3", "10.0.0.8", "BDMS-DEVICE01", "Test Browser", 15]);
});

test("prunes sessions that exceed the absolute or idle lifetime", async () => {
  const calls = [];
  const store = createSessionStore({
    async query(sql, params) {
      calls.push({sql, params});
      return {rowCount: 3, rows: []};
    }
  });

  assert.equal(await store.pruneExpired(), 3);
  assert.match(calls[0].sql, /last_seen_at <= NOW\(\) - make_interval\(mins => \$2::int\)/);
  assert.deepEqual(calls[0].params, [30, 15]);
});
