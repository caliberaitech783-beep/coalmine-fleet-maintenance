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

  await store.create({token: "token-1", role: "super", name: "Anoop Paul"});

  assert.match(calls[0].sql, /INSERT INTO auth_sessions/);
  assert.deepEqual(calls[0].params, ["token-1", "super", "Anoop Paul"]);
});

test("loads an existing session from PostgreSQL", async () => {
  const store = createSessionStore({
    async query(sql, params) {
      assert.match(sql, /FROM auth_sessions/);
      assert.deepEqual(params, ["token-1"]);
      return {rows: [{role: "super", name: "Anoop Paul"}]};
    }
  });

  assert.deepEqual(await store.get("token-1"), {role: "super", name: "Anoop Paul"});
});

test("does not query PostgreSQL when no token is supplied", async () => {
  const store = createSessionStore({
    async query() {
      assert.fail("query should not be called");
    }
  });

  assert.equal(await store.get(""), null);
});
