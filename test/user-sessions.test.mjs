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
  assert.match(client, /SESSION_IDLE_TIMEOUT_MS = 30 \* 60 \* 1000/);
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
  assert.match(server, /ALTER TABLE session_messages ADD COLUMN IF NOT EXISTS audio_data/);
  assert.match(server, /audio_data AS "audioData"/);
  assert.match(client, /function SessionMessageComposer/);
  assert.match(client, /function SessionMessageInbox/);
  assert.match(client, /Record voice message/);
  assert.match(client, /current\.audioData&&<audio/);
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

test("administrators can delete user activity older than N days from the User Sessions page, and the purge is audited", () => {
  assert.match(server, /app\.delete\('\/api\/user-login-history',requireSuper,requireAdministrator/);
  assert.match(server, /housekeepingCutoff\(\{\.\.\.\(req\.body\|\|\{\}\),\.\.\.req\.query\},'user activity'\)/, "same older-than-days or up-to-date window as the Audit Trail purge; today is never deleted");
  assert.match(server, /DELETE FROM user_login_history WHERE last_seen_at<\$1',\[cutoff\.toISOString\(\)\]/);
  assert.match(server, /DELETE FROM user_session_activity WHERE last_seen_at<\$1',\[cutoff\.toISOString\(\)\]/);
  assert.match(server, /req\.audit=\{eventType:'Administration',module:'User activity',action:'Delete old user activity'/, "the automatic audit middleware records the purge with its counts");
  assert.match(server, /res\.json\(\{deleted:deletedHistory\+deletedActivity,deletedLoginHistory:deletedHistory,deletedSessionActivity:deletedActivity,\.\.\.window/);
  const page = client.slice(client.indexOf("function UserSessionsPage("), client.indexOf("function reportCategoryIdsForUser("));
  assert.match(page, /useState\("2"\),\[activityPurging,setActivityPurging\]/, "the dialog defaults to two days");
  assert.match(page, /> Delete old activity</);
  assert.match(page, /window\.confirm\(`Permanently delete every user activity record \$\{activitySelection\.label\}/);
  assert.match(page, /fetch\(`\/api\/user-login-history\?\$\{activitySelection\.query\}`,\{method:"DELETE"/);
  assert.match(page, /<PurgeWindowFields mode=\{activityPurgeMode\}[^>]*verb="last active"/, "the shared older-than / up-to-date fields are used");
  assert.match(page, /<Modal title="Delete old user activity"/);
  assert.match(page, /Delete permanently/);
  assert.match(page, /await load\(\{quiet:true\}\);/, "the list reloads after a purge");
});

test('the User Sessions header is compact: title only, short summary cards, toolbar close to the top',()=>{
  const styles=readFileSync(new URL("../src/user-sessions.css", import.meta.url), "utf8");
  assert.match(client,/<header><div><h1>User Sessions<\/h1><\/div>/,'the eyebrow and the description sentence are gone');
  assert.doesNotMatch(client,/Security and access<\/span><h1>User Sessions/);
  assert.doesNotMatch(client,/securely close sessions\./);
  assert.match(styles,/\.user-session-summary article\{display:flex;align-items:center;gap:12px;min-height:0;padding:9px 18px;/,'summary cards are short');
  assert.match(styles,/\.user-session-kpi-icon\{display:grid;place-items:center;width:34px;height:34px;/);
  assert.match(styles,/\.user-session-summary b\{display:block;margin-top:1px;color:#132541;font-size:20px;/);
  assert.match(styles,/\.user-session-toolbar\{display:flex;align-items:center;gap:14px;padding:9px 20px;/,'the search and filter row sits higher');
  assert.match(styles,/\.user-sessions-page>header\{align-items:center;padding-top:12px;padding-bottom:10px;min-height:0\}/);
});

test('every User Sessions row is bold: name, status, session, role, location, device',()=>{
  const styles=readFileSync(new URL("../src/user-sessions.css", import.meta.url), "utf8");
  assert.match(styles,/\.user-session-table td\{padding:14px 16px;border-bottom:1px solid #e5eaf1;color:#132541;font-size:13px;font-weight:700;vertical-align:middle\}/);
  assert.match(styles,/\.session-device small\{display:block;margin-top:4px;color:#5b6a82;font-size:12px;font-weight:700\}/,'the second lines (login, device id) are bold too');
  assert.match(styles,/\.user-session-table code\{font:700 12px/);
});
