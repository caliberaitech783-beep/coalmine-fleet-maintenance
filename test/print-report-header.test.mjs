import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("table print layout suppresses browser headers and keeps report spacing", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /@page\{size:\$\{page\.name\} landscape;margin:0\}body\{margin:12mm\}/);
  // The chosen A3/A4 page drives the hidden layout width, and wide reports are scaled down to fit it.
  assert.match(source, /frame\.style\.width = `\$\{page\.widthMm\}mm`;/);
  assert.match(source, /printFitScale\(Math\.max\(0, \.\.\.tables\.map/);
  assert.match(source, /<body><h1>\$\{escapeExportHtml\(title\)\}<\/h1>/);
});
