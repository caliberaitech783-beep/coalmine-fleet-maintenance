import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const remoteAssistance = readFileSync(new URL("../src/remote-assistance.jsx", import.meta.url), "utf8");

test("user-session administration is restricted, token-safe, and auditable", () => {
  assert.match(server, /app\.get\('\/api\/user-sessions',requireSuper,requireAdministrator/);
  assert.match(server, /app\.delete\('\/api\/user-sessions\/:sessionId',requireSuper,requireAdministrator/);
  assert.match(server, /\['admin','super admin'\]\.includes\(adminLevel\)/);
  assert.match(server, /app\.get\('\/api\/audit-events',requireSuper,requireAdministrator/);
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
  assert.match(client, /const canViewAdmin=session\?\.role==="super"&&\["admin","super admin"\]\.includes/);
  assert.match(client, /function UserSessionsPage/);
  assert.match(client, /Active in the last 2 minutes/);
  assert.match(client, /Current session/);
  assert.match(client, /Force close/);
  assert.match(client, /\/api\/session-heartbeat/);
  assert.match(client, /SESSION_IDLE_TIMEOUT_MS = 15 \* 60 \* 1000/);
  assert.match(client, /activityEvents=\['pointerdown','keydown','touchstart','wheel'\]/);
  assert.match(client, /<th>Location<\/th>/);
  assert.match(client, /<th>User<\/th><th>Status<\/th><th>Message<\/th><th>Action<\/th><th>Role<\/th><th>Location<\/th>/);
  assert.match(client, /row\.location\|\|'Not assigned'/);
  assert.match(client, /matchesSmartSearch\(query,row\.name,row\.login,row\.roleLabel,row\.location/);
});

test("online sessions support persistent direct messages", () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS session_messages/);
  assert.match(server, /app\.post\('\/api\/user-sessions\/:sessionId\/messages',requireSuper,requireAdministrator/);
  assert.match(server, /last_seen_at>NOW\(\)-INTERVAL '2 minutes' AS online/);
  assert.match(server, /app\.get\('\/api\/session-messages',requireSession/);
  assert.match(server, /app\.patch\('\/api\/session-messages\/:messageId\/dismiss',requireSession/);
  assert.match(server, /target_session_public_id=\$1 AND dismissed_at IS NULL/);
  assert.match(client, /function SessionMessageComposer/);
  assert.match(client, /function SessionMessageInbox/);
  assert.match(client, /role="alertdialog" aria-modal="true"/);
  assert.match(client, /This message will remain open until you close it\./);
  assert.match(client, /disabled=\{!row\.online\|\|row\.current\}/);
  assert.doesNotMatch(client.match(/function SessionMessageInbox[\s\S]*?\n}\n\nfunction UserSessionsPage/)?.[0]||"",/setTimeout\([^,]+,\s*\d+\).*dismiss/);
});

test("remote assistance is consent based, time limited, and restricted to administrators", () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS remote_assistance_sessions/);
  assert.match(server, /app\.post\('\/api\/user-sessions\/:sessionId\/assistance',requireSuper,requireAdministrator/);
  assert.match(server, /app\.patch\('\/api\/remote-assistance\/:assistanceId\/respond',requireSession/);
  assert.match(server, /target_session_public_id=\$3 AND status='Pending'/);
  assert.match(server, /REMOTE_ASSISTANCE_DURATIONS=new Set\(\[5,10,15\]\)/);
  assert.match(server, /access_level='control'/);
  assert.match(server, /requester_login=\$2/);
  assert.match(server, /action:`Remote \$\{commandType\}`/);
  assert.match(server, /action:'End BDMS assistance'/);
});

test("the browser agent masks protected controls and keeps user disconnect available", () => {
  assert.match(client, /<th>Assistance<\/th>/);
  assert.match(client, /<RemoteAssistanceAgent session=\{session\}/);
  assert.match(remoteAssistance, /User approval is required/);
  assert.match(remoteAssistance, /blockSelector:'\[data-remote-assistance-ui\],input\[type="file"\]'/);
  assert.match(remoteAssistance, /maskInputOptions:\{password:true\}/);
  assert.match(remoteAssistance, /input\[type="password"\]/);
  assert.match(remoteAssistance, /Approve BDMS assistance/);
  assert.match(remoteAssistance, /End assistance/);
  assert.match(remoteAssistance, /This BDMS tab only/);
});
