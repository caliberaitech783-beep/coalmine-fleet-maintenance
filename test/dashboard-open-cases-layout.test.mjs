import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("open cases use the shared responsive three-step asset drilldown", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

  assert.match(source, /openAssetDrilldown\("open-cases"\)/);
  assert.match(source, /if \(key === "open-cases"\) return requestAssetRows\(openCaseRequests\)/);
  assert.doesNotMatch(source, /className="open-case-modal"/);
  assert.match(styles, /\.dashboard-asset-modal\{width:min\(1500px,calc\(100vw - 64px\)\);max-height:94vh\}/);
  assert.match(styles, /@media\(max-width:700px\)\{[\s\S]*\.modal,\.dashboard-asset-modal\{width:calc\(100vw - 20px\)\}/);
});
