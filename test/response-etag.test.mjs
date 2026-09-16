import assert from "node:assert/strict";
import test from "node:test";
import {jsonEntityTag, requestEtagMatches} from "../response-etag.mjs";

test("JSON entity tags are stable for unchanged payloads and namespaced by endpoint", () => {
  const body = JSON.stringify({records: [{ref: "BD-1"}]});
  assert.equal(jsonEntityTag("requests", body), jsonEntityTag("requests", body));
  assert.notEqual(jsonEntityTag("requests", body), jsonEntityTag("info-pulse", body));
  assert.notEqual(jsonEntityTag("requests", body), jsonEntityTag("requests", `${body} `));
  assert.match(jsonEntityTag("requests", body), /^W\/"bdms-requests-[A-Za-z0-9_-]+"$/);
});

test("If-None-Match accepts exact, weak, list and wildcard validators", () => {
  const etag = jsonEntityTag("requests", "[]");
  assert.equal(requestEtagMatches(etag, etag), true);
  assert.equal(requestEtagMatches(`"other", ${etag.replace(/^W\//, "")}`, etag), true);
  assert.equal(requestEtagMatches("*", etag), true);
  assert.equal(requestEtagMatches('"different"', etag), false);
  assert.equal(requestEtagMatches("", etag), false);
});
