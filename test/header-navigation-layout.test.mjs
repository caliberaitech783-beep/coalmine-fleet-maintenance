import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("desktop navigation uses bounded tracks and collapses before labels can overlap", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(source, /className="nav-label"/);
  assert.match(styles, /grid-template-columns: max-content minmax\(0, 1fr\) clamp\(150px, 12vw, 190px\)/);
  assert.match(styles, /\.app > aside nav \.nav-label \{[\s\S]*text-overflow: ellipsis/);
  assert.match(styles, /@media \(max-width: 1600px\) and \(min-width: 1251px\)/);
  assert.match(styles, /@media \(max-width: 1250px\) \{[\s\S]*\.menubtn \{[\s\S]*display: block !important/);
  assert.match(styles, /@media \(max-width: 1250px\) \{[\s\S]*\.app > aside \{[\s\S]*display: flex;[\s\S]*transform: translateY\(-110%\)/);
});
