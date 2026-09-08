import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/mobile-workflow.css", import.meta.url), "utf8");

test("maintenance can red flag only an unreceived vehicle delayed by at least one hour", () => {
  assert.match(server, /ADD COLUMN IF NOT EXISTS arrival_flagged_at TIMESTAMPTZ/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS arrival_flagged_by TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /app\.patch\('\/api\/requests\/:reference\/arrival-flag',requireSession,requirePermission\('editRequests',\{role:'Maintenance User'\}\)/);
  const route = server.slice(server.indexOf("app.patch('/api/requests/:reference/arrival-flag'"), server.indexOf("async function activeRequestConflict"));
  assert.match(route, /acceptance_required=TRUE AND accepted_at IS NULL/);
  assert.match(route, /started_at<=NOW\(\)-INTERVAL '1 hour'/);
  assert.match(route, /status NOT IN \('Closed','Idle','Ideal'\)/);
  assert.match(route, /arrival_flagged_at IS NULL/);
  assert.match(route, /arrival_flagged_at=NOW\(\),arrival_flagged_by=\$1/);
  assert.match(route, /outside your assigned maintenance location/);
});

test("the red flag action precedes Edit and flagged requests stay idempotent", () => {
  const actions = client.slice(client.indexOf("const workflowActions"), client.indexOf("useEffect(() =>", client.indexOf("const workflowActions")));
  assert.ok(actions.indexOf("arrival-red-flag") < actions.indexOf("<Pencil /> Edit"));
  assert.match(actions, /requestAwaitingAcceptance\(row, now\) && !row\.arrivalFlaggedAt/);
  assert.match(actions, /row\.arrivalFlaggedAt && <span className="arrival-flagged"/);
  assert.match(client, /onFlagArrival=\{permissions\.editRequests \? flagArrival : null\}/);
  assert.match(client, /action === "arrival-flag" \? `\/api\/requests\/\$\{encodeURIComponent\(reference\)\}\/arrival-flag`/);
  assert.match(styles, /button\.arrival-red-flag\{[^}]*background:#c9253d/);
});

test("maintenance Red Flag Report includes delay, flagger and receipt details", () => {
  for (const label of ["Red flag raised", "Flagged by", "Waiting when flagged", "Vehicle received", "Arrival delay", "Received by"]) {
    assert.ok(client.includes(label), `${label} should appear in the report`);
  }
  assert.match(client, /redFlagRows=requestRows\.filter\(\(row\)=>Boolean\(row\.arrivalFlaggedAt\)\)/);
  assert.match(client, /Red Flag Report/);
  assert.match(client, /rows=\{redFlagRows\}[\s\S]*showArrivalFlagData[\s\S]*highlightLateAcceptance/);
  assert.match(server, /AS "arrivalFlaggedAt", arrival_flagged_by AS "arrivalFlaggedBy"/);
});
