import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("login role choices use view-oriented labels without changing role values", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.match(source, /onClick=\{\(\) => setRole\("super"\)\}[\s\S]*<b>Desktop View<\/b>/);
  assert.match(source, /onClick=\{\(\) => setRole\("normal"\)\}[\s\S]*<b>Mobile View<\/b>/);
});
