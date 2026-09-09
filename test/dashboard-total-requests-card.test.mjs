import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("request lifecycle total card combines open and closed requests", () => {
  assert.match(source, /label: "Total Requests", note: "Open \+ Closed", value: requestLifecycleRows\.opened\.length \+ requestLifecycleRows\.closed\.length/);
  assert.match(source, /item\.key === "total" \? openAssetDrilldown\("event:all"\)/);
  assert.doesNotMatch(source, /label: "Opened", note: "New requests"/);
});
