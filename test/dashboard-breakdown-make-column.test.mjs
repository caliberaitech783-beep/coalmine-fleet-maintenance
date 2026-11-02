import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");

test("breakdown, OEM BD and BD Balance reports show Make immediately before Model", () => {
  assert.match(source, /\{bdBalanceColumns && <th>Make<\/th>\}<th>Model<\/th>/);
  assert.match(source, /\{bdBalanceColumns && <td>\{record\.make \|\| "—"\}<\/td>\}<td>\{record\.model \|\| "—"\}<\/td>/);
  assert.match(source, /\+ \(bdBalanceColumns \? 3 : 0\)/);
});
