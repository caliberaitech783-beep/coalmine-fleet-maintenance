import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("remaining dashboard cards fill each responsive grid row", () => {
  assert.match(css, /\.mine-dashboard-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.mine-span-2,\.mine-people-panel\{grid-column:span 2\}/);
  assert.match(css, /\.mine-span-2,\.mine-people-panel,\.mine-recent\{grid-column:auto\}/);
  assert.match(client, /className="mine-panel mine-people-panel"/);
});
