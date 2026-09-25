import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const readability = fs.readFileSync(new URL("../src/dashboard-readability.css", import.meta.url), "utf8");
const night = fs.readFileSync(new URL("../src/dashboard-night.css", import.meta.url), "utf8");

test("the site-wise BD table ends with a Total row after the site rows", () => {
  const table = client.indexOf('className="mine-breakdown-site-table"');
  const body = client.indexOf('className="mine-breakdown-site-body"', table);
  const total = client.indexOf('className="mine-breakdown-site-row mine-breakdown-site-total"', body);
  const roadView = client.indexOf('className="mine-site-road-view"', table);
  assert.ok(table >= 0 && body > table && total > body && roadView > total, "Total row sits below the site rows, inside the BD table");
  assert.match(client, /\{breakdownSiteSummary\.length > 0 && \(\(\) => \{/, "hidden when no sites are listed");
  assert.match(client, /<span className="site"><b>Total :<\/b><\/span>/);
});

test("the Total row sums every column of the listed sites", () => {
  const block = client.slice(client.indexOf("breakdownSiteSummary.length > 0 && (() => {"), client.indexOf('className="mine-site-road-view"'));
  for (const key of ["open", "incoming", "outgoing", "balance"]) assert.match(block, new RegExp(`sum\\.${key} \\+= site\\.${key}`), `${key} is summed`);
  for (const key of ["total", "onRoad", "offRoad", "idle"]) assert.match(block, new RegExp(`sum\\.road\\.${key} \\+= road\\.${key}`), `road ${key} is summed`);
  assert.match(block, /availabilityPercentFromCounts\(road\)/, "availability comes from the summed counts, not an average of site percentages");
  for (const cls of ["metric open", "metric incoming", "metric outgoing", "metric balance", "metric idle", "mine-breakdown-road-impact", "mine-road-site-bar"]) assert.ok(block.includes(`className="${cls}"`), `${cls} column is shown`);
});

test("the Total row is styled apart from site rows in day and night themes", () => {
  assert.match(readability, /\.mine-breakdown-site-row\.mine-breakdown-site-total \{[^}]*border-top: 2px solid[^}]*cursor: default;/);
  assert.match(readability, /\.mine-breakdown-site-total > \.site b \{ color: #c9554d;/);
  assert.match(night, /\.mine-dashboard-night \.mine-breakdown-site-total > \.site b \{ color: #ff8a8e; \}/);
});
