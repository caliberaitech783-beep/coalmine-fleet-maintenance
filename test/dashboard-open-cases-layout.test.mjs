import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("the fleet registry no longer renders the open cases card", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../src/dashboard-record-browser.css", import.meta.url), "utf8");

  assert.doesNotMatch(source, /className="mine-panel mine-open-cases"/);
  assert.match(source, /if \(key === "open-cases"\) return requestAssetRows\(openCaseRequests\)/);
  assert.doesNotMatch(source, /className="open-case-modal"/);
  assert.match(source, /<Modal className="dashboard-asset-modal" overlayClassName="dashboard-asset-overlay"/);
  assert.match(styles, /\.dashboard-asset-overlay \{ padding: 0; place-items: stretch; \}/);
  assert.match(styles, /\.modal\.dashboard-asset-modal \{ width: 100%; max-width: none; height: 100vh; height: 100dvh; max-height: none; border-radius: 0; \}/);
  assert.match(styles, /\.dashboard-record-browser \.dashboard-asset-list \{ flex: 1; min-height: 0; max-height: none; overflow: auto; \}/);
});
