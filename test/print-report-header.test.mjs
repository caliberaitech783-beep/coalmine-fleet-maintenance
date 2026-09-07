import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("table print layout suppresses browser headers and keeps report spacing", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /@page\{size:A4 landscape;margin:0\}body\{margin:12mm\}/);
  assert.match(source, /<body><h1>\$\{escapeExportHtml\(title\)\}<\/h1>/);
});
