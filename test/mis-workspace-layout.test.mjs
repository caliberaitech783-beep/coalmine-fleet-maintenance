import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mainSource = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const workflowStyles = fs.readFileSync(new URL("../src/mobile-workflow.css", import.meta.url), "utf8");

test("the workspace tab strip sits inside the banner", () => {
  const hero = mainSource.slice(
    mainSource.indexOf('<div className="welcome workspace-hero">'),
    mainSource.indexOf('{isProduction && tab === "requests"'),
  );
  assert.match(hero, /<div className="workspace-hero-intro">/);
  assert.match(hero, /<div className="mobile-tabs" role="tablist">/);
  for (const label of ["Requests", "Verify closed requests", "Closed history", "Idle Vehicles"]) {
    assert.ok(hero.includes(`>${label}</button>`), `${label} tab should render inside the banner`);
  }
  assert.match(hero, /<\/div>\s*<\/div>\s*$/);
  assert.match(workflowStyles, /\.welcome\.workspace-hero\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(workflowStyles, /\.welcome\.workspace-hero\s\.mobile-tabs\s*\{[^}]*margin:\s*0/s);
});

test("the workspace body claims the full width and starts right under the banner", () => {
  assert.match(mainSource, /\{\(embedded\|\|section==="profile"\)&&<div className="mobile-workspace">/);
  assert.match(workflowStyles, /\.normal > main:has\(\.mobile-workspace\)\s*\{[^}]*padding:\s*22px clamp\(/s);
  assert.match(workflowStyles, /\.mobile-workspace \.sectiontitle\s*\{[^}]*margin:\s*4px 0 8px/s);
});

test("workflow tables keep a single horizontal scrollbar that stays on screen", () => {
  assert.doesNotMatch(mainSource, /table-top-scroll/);
  assert.doesNotMatch(workflowStyles, /table-top-scroll/);
  assert.match(mainSource, /<div className="scroll mobile-workflow-table">/);
  assert.match(
    workflowStyles,
    /\.normal:not\(\.embedded-workspace\):has\(\.mobile-workspace\)\s*\{[^}]*height:\s*100vh;[^}]*overflow:\s*hidden/s,
  );
  assert.match(
    workflowStyles,
    /\.normal:not\(\.embedded-workspace\) \.mobile-workspace \.scroll\.mobile-workflow-table\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0/s,
  );
});
