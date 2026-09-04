import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("maintenance reminders use their partial unique index without breaking notification polling", () => {
  assert.match(server, /ON CONFLICT \(notification_key\) WHERE notification_key IS NOT NULL DO NOTHING/);
  assert.match(server, /createMaintenanceReminderNotifications\(\)\.catch[\s\S]*Maintenance reminder notification generation failed/);
});

test("closing a request is idempotent and independent from follow-up notification storage", () => {
  const closeRoute = server.slice(
    server.indexOf("app.patch('/api/requests/:reference/close'"),
    server.indexOf("app.patch('/api/requests/:reference/ideal-onroad'"),
  );

  assert.match(closeRoute, /existingRows\[0\]\.status==='Closed'[\s\S]*return res\.json\(existingRows\[0\]\)/);
  assert.match(closeRoute, /status==='Closed'[\s\S]*SET closed_at=\$1,closed_by=\$2[\s\S]*status='Closed'/);
  assert.match(closeRoute, /addTicketNotificationsBestEffort/);
  assert.match(closeRoute, /was closed, but its notification recipients could not be resolved/);
});

test("MIS verification responds before report and notification side effects", () => {
  const verifyRoute = server.slice(
    server.indexOf("app.patch('/api/requests/:reference/verify'"),
    server.indexOf("app.get('/api/requests/:reference/trip-card'"),
  );

  assert.match(verifyRoute, /res\.json\(rows\[0\]\);\s*void sendRequestEventReports\('verified',rows\[0\]\)/);
  assert.match(verifyRoute, /addTicketNotificationsBestEffort/);
  assert.match(verifyRoute, /was verified, but its notification recipients could not be resolved/);
  assert.doesNotMatch(verifyRoute, /await sendRequestEventReports\('verified'/);
});

test("MIS verification is idempotent across mobile retries and concurrent submissions", () => {
  const verifyRoute = server.slice(
    server.indexOf("app.patch('/api/requests/:reference/verify'"),
    server.indexOf("app.get('/api/requests/:reference/trip-card'"),
  );

  assert.match(verifyRoute, /if\(existing\.verifiedAt\)return res\.json\(existing\)/);
  assert.match(verifyRoute, /retryRows\[0\]\?\.verifiedAt[\s\S]*return res\.json\(retryRows\[0\]\)/);
  assert.match(verifyRoute, /canonicalSiteName\(existing\.site\)!==canonicalSiteName\(misSite\)/);
  assert.match(verifyRoute, /existing\.status!=='Closed'/);
});
