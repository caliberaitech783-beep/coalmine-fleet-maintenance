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

test("request forms fetch and persist Oracle logbook driver names", () => {
  const oracle = fs.readFileSync(new URL("../oracle-db.mjs", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(oracle, /equipmentlogbookdetail/i);
  assert.match(oracle, /vehiclelogbookdetail/i);
  assert.match(oracle, /cmpl\.employee/i);
  assert.match(oracle, /request_date/);
  assert.match(oracle, /request_time/);
  assert.match(oracle, /location_key/);
  assert.match(oracle, /equipment_key/);
  assert.match(server, /app\.get\('\/api\/oracle\/driver',requireSession/);
  assert.match(server, /driver_name TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /driver_name_source TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /driver_name AS "driverName"/);
  assert.match(server, /syncTemporaryRequestDrivers/);
  assert.match(server, /2\*60\*60\*1000/);
  assert.match(client, /Driver \/ operator name/);
  assert.match(client, /\/api\/oracle\/driver\?/);
  assert.match(client, /driverName: driverLookup\.name/);
  assert.match(client, /name: "Demo Driver", source: "Demo"/);
  assert.match(client, /source: event\.target\.value\.trim\(\) === "Demo Driver" \? "Demo" : "Manual"/);
});
