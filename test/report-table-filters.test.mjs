import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("every report table supports header filters, sorting, and equipment comparison fields", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const reportsSource = source.slice(source.indexOf("function ReportsPage"), source.indexOf("function MasterPage"));

  assert.match(source, /function ReportTable\(/);
  assert.match(source, /<FilterableHeader/);
  assert.match(source, /onSort=\{changeSort\}/);
  assert.match(source, /elapsedMilliseconds\(request\.start, request\.closedAt\)/);
  assert.equal((reportsSource.match(/<ReportTable/g) || []).length, 4);
  assert.match(reportsSource, /reportMake: request\.make \|\| equipment\?\.make/);
  assert.match(reportsSource, /reportModel: request\.model \|\| equipment\?\.model/);
  assert.equal((reportsSource.match(/key: "make"/g) || []).length, 3);
  assert.equal((reportsSource.match(/key: "model"/g) || []).length, 3);
});
