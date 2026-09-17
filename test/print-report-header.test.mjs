import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("table print layout suppresses browser headers and keeps report spacing", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /@page\{size:landscape;margin:0\}body\{margin:12mm\}/);
  // No fixed paper size: a fixed size hides the browser's Paper size option and prints shrunken when the printer's paper differs.
  assert.doesNotMatch(source, /@page\{size:(?:A4|A3|\$\{)/);
  // The preview itself warns when the print window's paper is not the size chosen in Smart Print.
  assert.match(source, /@media print and \(\$\{page\.name === "A3" \? "max-width" : "min-width"\}:350mm\)\{\.paper-warning\{display:block\}\}/);
  assert.match(source, /<div class="paper-warning">Paper size does not match: this report was prepared for \$\{page\.name\}\./);
  // The chosen A3/A4 page drives the hidden layout width, and wide reports are scaled down to fit it.
  assert.match(source, /frame\.style\.width = `\$\{page\.widthMm\}mm`;/);
  assert.match(source, /printFitScale\(Math\.max\(0, \.\.\.tables\.map/);
  assert.match(source, /<body><h1>\$\{escapeExportHtml\(title\)\}<\/h1>/);
});
