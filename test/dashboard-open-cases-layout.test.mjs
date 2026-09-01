import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("open-cases drilldown stays within the viewport and scrolls its table internally", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

  assert.match(source, /<Modal className="open-case-modal" title="Open cases by site"/);
  assert.match(styles, /\.open-case-modal\{[^}]*width:min\(1720px,calc\(100vw - 40px\)\)[^}]*height:min\(800px,calc\(100dvh - 40px\)\)[^}]*overflow:hidden/);
  assert.match(styles, /\.open-case-drilldown\{[^}]*min-width:0[^}]*min-height:0[^}]*overflow:hidden/);
  assert.match(styles, /\.open-case-results>\.scroll\{[^}]*flex:1[^}]*min-height:0[^}]*overflow:auto/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.open-case-modal\{[^}]*width:calc\(100vw - 20px\)[^}]*height:calc\(100dvh - 20px\)/);
});
