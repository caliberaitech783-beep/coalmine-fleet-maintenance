import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("selecting a master suppresses hover reopening until pointer leave", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(source, /setMastersSelectionClosed\(true\)/);
  assert.match(source, /onPointerLeave=\{\(\) => setMastersSelectionClosed\(false\)\}/);
  assert.match(source, /event\.currentTarget\.blur\(\)/);
  assert.match(css, /\.masters-menu:not\(\.selection-closed\):hover \.masters-dropdown/);
  assert.match(css, /\.masters-menu:not\(\.selection-closed\):focus-within \.masters-dropdown/);
});
