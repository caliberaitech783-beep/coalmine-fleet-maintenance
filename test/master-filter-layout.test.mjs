import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("master filter values retain readable row spacing", async () => {
  const css = await readFile(new URL("../src/sortable-table.css", import.meta.url), "utf8");
  const rule = css.match(/\.column-filter-values button\{([^}]*)\}/)?.[1] ?? "";

  assert.match(rule, /min-height:32px/);
  assert.match(rule, /padding:8px 10px/);
  assert.match(rule, /line-height:1\.35/);
  assert.match(rule, /flex:0 0 auto/);
});
