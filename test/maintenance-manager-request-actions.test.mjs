import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { managerRoleSelection } from "../admin-access.mjs";

const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const slice = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

const guards = new Function("managerRoleSelection", `${slice(server, "function requirePermission(", "async function requireSuper(")}
return { maintenanceManagerSession, requireMaintenanceUpdatePermission };`)(managerRoleSelection);

const run = (session, permission = "editRequests") => {
  let status = 200, passed = false;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  guards.requireMaintenanceUpdatePermission(permission)({ session }, res, () => { passed = true; });
  return passed ? 200 : status;
};

test("Maintenance Managers may edit and post daily updates; other managers stay blocked", () => {
  const manager = (roles) => ({ role: "super", permissions: { adminLevel: "Manager", managerRoles: roles } });
  assert.equal(run(manager(["Maintenance Manager"])), 200);
  assert.equal(run(manager(["Production Manager", "Maintenance Manager"]), "closeRequests"), 200);
  assert.equal(run(manager(["Production Manager"])), 403);
  assert.equal(run(manager(["MIS Manager"]), "closeRequests"), 403);
  assert.equal(run({ role: "normal", assignedRole: "Maintenance User", permissions: { editRequests: true } }), 200);
  assert.equal(run({ role: "normal", assignedRole: "Maintenance User", permissions: {} }), 403);
});

test("manager request updates use the shared guard and stay within the manager's sites", () => {
  for (const route of ["daily-remarks',requireSession,requireMaintenanceUpdatePermission('closeRequests')",
    ":reference',requireSession,requireMaintenanceUpdatePermission('editRequests')",
    "delayed-reason',requireSession,requireMaintenanceUpdatePermission('editRequests')"]) assert.ok(server.includes(route), route);
  const guard = slice(server, "async function withMaintenanceArrivalGuard", "app.post('/api/requests/:reference/daily-remarks'");
  assert.match(guard, /maintenanceManagerSession\(req\.session\)&&!userManagesSite\(/);
  const arrival = slice(server, "app.patch('/api/requests/:reference/arrival-flag'", "app.post('/api/requests'");
  assert.match(arrival, /maintenanceManagerSession\(req\.session\)&&!userManagesSite\(/);
  assert.doesNotMatch(slice(server, "app.patch('/api/requests/:reference/close'", "app.patch('/api/requests/:reference/ideal-onroad'"), /requireMaintenanceUpdatePermission/);
});

test("the Maintenance Manager workload table shows Edit and Daily update actions", () => {
  const manager = slice(source, "function ManagerDashboard", "const OEM_CHART_VIEWPORT_GAP");
  assert.match(manager, /canUpdateRequests=activeManagerRole==="Maintenance Manager"&&queueTab==="active"/);
  assert.match(manager, /onEdit=\{canUpdateRequests\?/);
  assert.match(manager, /onRemark=\{canUpdateRequests\?/);
  assert.match(manager, /<RequestEditForm[\s\S]*<DailyRemarkForm[\s\S]*<RequestRedFlagForm flagKind="arrival"/);
  const table = slice(source, "function BreakdownTable", "\nfunction ");
  assert.match(table, /<Pencil \/> Edit/);
  assert.match(table, /<MessageCircle \/> Daily update/);
  assert.match(source, /onUpdateRequest=\{updateRequest\} onAddDailyRemark=\{addDailyRemark\} TimelineButton=\{RequestTimelineButton\} \/>/);
});
