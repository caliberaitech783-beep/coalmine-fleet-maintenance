import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("operational profile headers use left-led responsive navigation", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(source, /className="normal-header-actions"/);
  assert.match(source, /className="normal-header-user"/);
  assert.match(styles, /\.normal > header \{[\s\S]*grid-template-columns: max-content minmax\(0, 1fr\)/);
  assert.match(styles, /\.normal-header-nav \{[\s\S]*justify-content: flex-start;[\s\S]*overflow-x: auto/);
  assert.match(styles, /@media \(max-width: 900px\) \{[\s\S]*\.normal-header-nav \{ grid-column: 1 \/ -1; grid-row: 2/);
  assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*\.normal-header-nav button \{ width: auto/);
});

test("wide operational headers reserve enough room for the Tickets tab before the timer", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/topbar.css", import.meta.url), "utf8");

  const navigation = source.slice(source.indexOf('<nav className="normal-header-nav">'), source.indexOf('</nav>', source.indexOf('<nav className="normal-header-nav">')));
  assert.ok(navigation.indexOf('<FileBarChart /> Reports') < navigation.indexOf('<Ticket /> Tickets'));
  assert.match(styles, /grid-template-columns: max-content minmax\(0, 1fr\) clamp\(205px, 16vw, 250px\) max-content/);
  assert.match(styles, /@media \(min-width: 1301px\)[\s\S]*?\.normal-header-nav \{ gap: 2px; \}[\s\S]*?padding-inline: clamp\(7px, \.55vw, 11px\)/);
});
