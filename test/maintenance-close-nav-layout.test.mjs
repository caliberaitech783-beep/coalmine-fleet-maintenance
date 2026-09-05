import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/mobile-workflow.css", import.meta.url), "utf8");

test("Maintenance close-request form is available beside the workspace top-nav item", () => {
  assert.match(source, /<Wrench \/> \{mobileRole\}<\/button>\}\{showRequestsMenu&&isMaintenance&&canSeeRequestMenu\("Close request form"\)&&<button className=\{`maintenance-close-nav/);
  assert.match(source, /maintenance-close-nav[^\n]*setSection\("profile"\);setTab\("close"\)[^\n]*<ClipboardCheck \/> Close request form/);
  const heroTabs = source.slice(source.indexOf('<div className="mobile-tabs" role="tablist">'), source.indexOf('</div>\n      </div>', source.indexOf('<div className="mobile-tabs" role="tablist">')));
  assert.doesNotMatch(heroTabs, />Close request form<\/button>/);
  assert.match(source, /onClick=\{\(\) => \{setSection\("profile"\);if\(isMaintenance\)setTab\("requests"\)\}\}/);
});

test("only Maintenance workspace receives the larger active-request area", () => {
  assert.match(source, /className=\{`mobile-workspace\$\{isMaintenance \? " maintenance-workspace" : ""\}`\}/);
  assert.match(styles, /\.maintenance-workspace > \.welcome\.workspace-hero \{[\s\S]*?padding-block: 18px/);
  assert.match(styles, /\.maintenance-workspace > section\.panel \{\s*min-height: 390px/);
  assert.match(styles, /\.normal-header-nav:has\(\.maintenance-close-nav\) \{\s*grid-template-columns: repeat\(5/);
});
