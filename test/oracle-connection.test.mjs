import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Oracle integration is read-only, lazy, protected, and environment configured", () => {
  const oracle = fs.readFileSync(new URL("../oracle-db.mjs", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const example = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(oracle, /process\.env\.ORACLE_DB_USER/);
  assert.match(oracle, /process\.env\.ORACLE_DB_PASSWORD/);
  assert.match(oracle, /process\.env\.ORACLE_DB_CONNECT_STRING/);
  assert.match(oracle, /oracledb\.createPool/);
  assert.match(oracle, /SELECT SYS_CONTEXT/);
  assert.doesNotMatch(oracle, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP)\b/i);
  assert.match(server, /app\.get\('\/api\/oracle\/health',requireSuper/);
  assert.doesNotMatch(example, /CMPLAI@123|13\.206\.103\.124/);
});
