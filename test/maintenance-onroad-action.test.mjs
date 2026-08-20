import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("maintenance close action is labelled Click for onroad", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.match(source, /onClose\(row\)[\s\S]*Click for onroad/);
});
