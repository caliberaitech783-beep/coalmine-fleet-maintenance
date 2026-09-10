import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("user-session administration is restricted, token-safe, and auditable", () => {
  assert.match(server, /app\.get\('\/api\/user-sessions',requireSuper,requireAdministrator/);
  assert.match(server, /app\.delete\('\/api\/user-sessions\/:sessionId',requireSuper,requireAdministrator/);
  assert.match(server, /permissions\?\.adminLevel!==\'Manager\'/);
  assert.match(server, /const sessions=rows\.map\(\(\{token,userRecord,\.\.\.row\}\)/);
  assert.match(server, /current:token===currentToken/);
  assert.match(server, /Your current session cannot be force closed/);
  assert.match(server, /action:'Force close session'/);
  assert.match(server, /LEFT JOIN LATERAL \([\s\S]*master_name='Users & employees'/);
  assert.match(server, /location:userSessionLocationName\(userRecord\|\|\{\},row\.roleLabel\)/);
});

test("the admin UI exposes live status and a protected force-close control", () => {
  assert.match(client, /const adminNav = \[[\s\S]*?\["User Sessions", UserRound\][\s\S]*?\["Audit Trail", History\]/);
  assert.match(client, /<span className="nav-label">Admin<\/span>/);
  assert.match(client, /permissions\.adminLevel !== "Manager"/);
  assert.match(client, /function UserSessionsPage/);
  assert.match(client, /Active in the last 2 minutes/);
  assert.match(client, /Current session/);
  assert.match(client, /Force close/);
  assert.match(client, /\/api\/session-heartbeat/);
  assert.match(client, /<th>Location<\/th>/);
  assert.match(client, /row\.location\|\|'Not assigned'/);
  assert.match(client, /matchesSmartSearch\(query,row\.name,row\.login,row\.roleLabel,row\.location/);
});
