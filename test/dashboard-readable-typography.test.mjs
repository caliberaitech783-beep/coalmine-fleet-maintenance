import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("fleet dashboard applies a readable font floor to every text category", async () => {
  const css = await readFile(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

  assert.match(css, /\.mine-dashboard h1 \{ font-size: 22px !important; \}/);
  assert.match(css, /\.mine-dashboard h2 \{ font-size: 15px !important; \}/);
  assert.match(css, /\.mine-dashboard :is\(p, label, small, em, span, b\) \{ font-size: 11px !important; \}/);
  assert.match(css, /\.mine-dashboard :is\(button, input, select, th\) \{ font-size: 11px !important; \}/);
  assert.match(css, /\.mine-dashboard td \{ font-size: 12px !important; \}/);
});
