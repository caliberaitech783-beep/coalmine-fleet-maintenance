import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/mobile-workflow.css", import.meta.url), "utf8");

test("Close request form is directly beside Idle Vehicles in the Maintenance workspace", () => {
  assert.match(source, />Idle Vehicles<\/button>}\s*{showRequestsMenu&&isMaintenance&&canSeeRequestMenu\("Close request form"\)&&<button[^\n]*>Close request form<\/button>}/);
  const topHeader = source.slice(source.indexOf("{!embedded && <header>"), source.indexOf("<main>"));
  assert.doesNotMatch(topHeader, /Close request form/);
  assert.doesNotMatch(topHeader, /> Requests<\/button>/);
});

test("Requests remains in every operational workspace and every role gets the larger table", () => {
  const start = source.indexOf('<div className="mobile-tabs" role="tablist">');
  const heroTabs = source.slice(start, source.indexOf('</div>\n      </div>', start));
  assert.match(heroTabs, />Requests<\/button>/);
  assert.match(styles, /\.mobile-workspace > \.welcome\.workspace-hero \{[\s\S]*?flex-direction: row;[\s\S]*?padding-block: 12px/);
  assert.match(styles, /\.mobile-workspace > section\.panel \{\s*min-height: 390px/);
});
