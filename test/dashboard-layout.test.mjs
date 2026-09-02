import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {DEFAULT_DASHBOARD_LAYOUT, normalizeDashboardLayout} from "../dashboard-layout.mjs";

test("dashboard layout accepts valid order and clamps KPI sizes", () => {
  assert.deepEqual(normalizeDashboardLayout({
    order: ["users", "assets", "users", "unknown"],
    sizes: {users: 3, assets: 0, roadstatus: 8, workload: 2},
  }), {
    order: ["users", "assets", "roadstatus", "workload", "repairtypes", "fleetregions", "intelligence", "trend"],
    sizes: {assets: 1, roadstatus: 3, workload: 2, users: 3, repairtypes: 3, fleetregions: 3, intelligence: 3, trend: 3},
    hidden: [],
  });
  assert.deepEqual(normalizeDashboardLayout(), DEFAULT_DASHBOARD_LAYOUT);
});

test("server stores a normalized dashboard layout for each signed-in login", () => {
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /CREATE TABLE IF NOT EXISTS dashboard_layout_preferences/);
  assert.match(server, /app\.get\('\/api\/me\/dashboard-layout',requireSession/);
  assert.match(server, /app\.put\('\/api\/me\/dashboard-layout',requireSession/);
  assert.match(server, /ON CONFLICT \(login_name\) DO UPDATE/);
});
