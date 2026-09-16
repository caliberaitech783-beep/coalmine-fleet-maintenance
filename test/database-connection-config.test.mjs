import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("isolated loopback audits can explicitly disable database TLS without changing the production default", () => {
  assert.match(server, /process\.env\.DATABASE_SSL\|\|''/);
  assert.match(server, /==='false'\?false:\{rejectUnauthorized:false\}/);
  assert.match(server, /ssl:databaseSsl/);
});
