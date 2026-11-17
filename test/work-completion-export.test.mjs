import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("request Excel reports export the saved work completion action without duplicates", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.equal(source.match(/exportColumns = filterColumns\.some\(\(column\) => column\.key === "maintenanceWork"\)/g)?.length, 2);
  assert.equal(source.match(/<ExportMenu title=\{exportTitle\} columns=\{exportColumns\} rows=\{sortedRows\}/g)?.length, 2);
});
