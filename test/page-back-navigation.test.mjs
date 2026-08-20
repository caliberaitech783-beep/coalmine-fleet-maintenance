import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("shared page header tracks and returns to the previous application page", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.match(source, /const pageHistory = useRef\(\["Dashboard"\]\)/);
  assert.match(source, /pageHistory\.current\.push\(name\)/);
  assert.match(source, /pageHistory\.current\.pop\(\)/);
  assert.match(source, /aria-label="Go back to previous page"/);
  assert.match(source, /disabled=\{!canGoBack\}/);
});
