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
    token: "11111111-1111-4111-8111-111111111111", role: "normal", name: "Anoop Paul", login: "anoop",
    userType: "Mobile User", assignedRole: "Production User", permissions: {createRequests: true},
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO auth_sessions/);
  assert.deepEqual(calls[0].params, ["11111111-1111-4111-8111-111111111111", "normal", "Anoop Paul", "anoop", "Mobile User", "Production User", '{"createRequests":true}']);
});

test("loads an existing session from PostgreSQL", async () => {
  const store = createSessionStore({
    async query(sql, params) {
      assert.match(sql, /FROM auth_sessions/);
      assert.match(sql, /created_at > NOW\(\) - make_interval\(days => \$2::int\)/);
      assert.doesNotMatch(sql, /last_seen_at/);
      assert.deepEqual(params, ["11111111-1111-4111-8111-111111111111", 7]);
      return {rows: [{role: "normal", name: "Anoop Paul", login: "anoop", userType: "Mobile User", assignedRole: "MIS User", permissions: {verifyRequests: true}}]};
    }
  });

  assert.deepEqual(await store.get("11111111-1111-4111-8111-111111111111"), {role: "normal", name: "Anoop Paul", login: "anoop", userType: "Mobile User", assignedRole: "MIS User", permissions: {verifyRequests: true}});
});

test("supports a bounded custom server-side session lifetime", async () => {
  const calls = [];
  const store = createSessionStore({
    async query(sql, params) {
      calls.push({sql, params});
      return {rows: []};
    }
  }, {maxAgeDays: 7});

  assert.equal(await store.get("22222222-2222-4222-8222-222222222222"), null);
  assert.deepEqual(calls[0].params, ["22222222-2222-4222-8222-222222222222", 7]);
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

  await store.touch("33333333-3333-4333-8333-333333333333", {
    ipAddress: "10.0.0.8",
    deviceId: "Caliber Pulse-DEVICE01",
    userAgent: "Test Browser",
  });

  assert.match(calls[0].sql, /UPDATE auth_sessions/);
  assert.match(calls[0].sql, /last_seen_at = NOW\(\)/);
  assert.doesNotMatch(calls[0].sql, /make_interval\(mins/);
  assert.deepEqual(calls[0].params, ["33333333-3333-4333-8333-333333333333", "10.0.0.8", "Caliber Pulse-DEVICE01", "Test Browser"]);
});

test("physical pruning delegates to the backup-gated job", async () => {
 const store=createSessionStore({query(){assert.fail('No unbacked DELETE');}}, {cleanup:async()=>({removed:{auth_sessions:3}})});
 assert.equal(await store.pruneExpired(),3);
 assert.equal(await createSessionStore({}).pruneExpired(),0);
});

test('malformed session tokens never reach PostgreSQL UUID comparisons',async()=>{const store=createSessionStore({query(){assert.fail('Malformed credential must not query the database')}});for(const token of [undefined,null,'','Bearer','undefined','null','Bearer Bearer','not-a-uuid','11111111-1111-4111-8111-11111111111g',{},123]){assert.equal(await store.get(token),null);await store.touch(token);}});
