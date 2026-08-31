import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("shared dashboards omit the duplicate vehicle-status cards", () => {
  const dashboard = client.slice(client.indexOf("function Dashboard"), client.indexOf("function BreakdownTable"));
  assert.doesNotMatch(dashboard, /<h2>Vehicle status<\/h2>/);
  assert.doesNotMatch(dashboard, /<h2>Availability mix<\/h2>/);
});
