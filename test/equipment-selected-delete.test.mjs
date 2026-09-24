import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("Equipment Master reviews and deletes every row matching the current filters", () => {
  const equipment = client.slice(client.indexOf("function Equipment("), client.indexOf("function Breakdown("));
  const actions = client.slice(client.indexOf("function MasterActions("), client.indexOf("function Equipment("));
  const hook = client.slice(client.indexOf("function useMasterRecords("), client.indexOf("function MetaWhatsAppSetup("));

  assert.match(equipment, /selectedRecords=\{rows\}/, "the complete filtered result is passed to the delete action");
  assert.match(actions, /Delete selected \(\$\{selectedRecordCount\}\)/);
  assert.match(actions, /setMode\("delete-selected"\)/, "the toolbar opens a review dialog instead of deleting immediately");
  assert.match(actions, /Are you sure you want to delete all of the records listed below\?/);
  assert.match(actions, /selectedEquipmentRecords\.map/);
  assert.match(actions, /Reason for deletion \*/);
  assert.match(actions, /Yes, delete selected/);
  assert.match(hook, /\/api\/masters\/\$\{encodeURIComponent\(name\)\}\/selected/);
  assert.match(hook, /"X-Audit-Reason": reason\.trim\(\)/);
  assert.match(hook, /current\.filter\(\(record\) => !deletedIds\.has\(Number\(record\.id\)\)\)/);
});

test("selected-record deletion is server-side restricted, validated, scoped, and audited", () => {
  const routeStart = server.indexOf("app.delete('/api/masters/:master/selected'");
  const routeEnd = server.indexOf("app.delete('/api/masters/:master/:id'", routeStart);
  const route = server.slice(routeStart, routeEnd);

  assert.ok(routeStart >= 0 && routeEnd > routeStart, "the selected route must be declared before the single-record route");
  assert.match(route, /master!==\'Equipment master\'/);
  assert.match(route, /req\.get\(AUDIT_REASON_HEADER\)/);
  assert.match(route, /Number\.isSafeInteger\(id\)/);
  assert.match(route, /DELETE FROM master_records WHERE master_name=\$1 AND id=ANY\(\$2::bigint\[\]\)/);
  assert.match(route, /action:'Delete selected records'/);
});
