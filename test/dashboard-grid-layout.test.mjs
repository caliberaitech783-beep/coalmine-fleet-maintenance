import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard intelligence panels fill a balanced responsive row", () => {
  assert.match(css, /\.mine-dashboard-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.mine-dashboard-core\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/);
  assert.match(client, /className="mine-panel mine-fleet-command"/);
  assert.match(client, /className="mine-panel mine-request-lifecycle"/);
  assert.doesNotMatch(client, /mine-primary-kpi-workload/);
  assert.doesNotMatch(client, /mine-primary-kpi-users/);
});
