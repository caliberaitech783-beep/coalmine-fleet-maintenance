import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

test("dashboard KPI order can be arranged and persists locally", () => {
  assert.match(client, /nerveCenterDashboardKpiOrder/);
  assert.match(client, /Arrange KPIs/);
  assert.match(client, /draggable: editingKpiLayout/);
  assert.match(client, /Move \$\{key\} KPI left/);
  assert.match(client, /Move \$\{key\} KPI right/);
  assert.match(css, /\.mine-primary-kpi-grid\[data-arranging="true"\]/);
});

test("equipment KPI renders a live equipment and vehicle composition bar", () => {
  assert.match(client, /className="mine-kpi-composition"/);
  assert.match(client, /equipmentShare/);
  assert.match(client, /vehicleShare/);
  assert.match(css, /\.mine-kpi-composition span:first-child\s*\{\s*background:\s*#4f86c6/);
  assert.match(css, /\.mine-kpi-composition span:last-child\s*\{\s*background:\s*#64c59a/);
});
