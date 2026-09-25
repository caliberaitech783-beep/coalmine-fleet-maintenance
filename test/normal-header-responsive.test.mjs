import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("operational header popovers stay above the dashboard toolbar and below modals at desktop widths", () => {
  const styles = readFileSync(new URL("../src/topbar.css", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/dashboard-filter-bar.css", import.meta.url), "utf8");
  const base = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const header = styles.match(/\.normal > header \{([^}]+)\}/)[1];
  const toolbar = dashboard.match(/\.mine-dashboard > \.dashboard-filter-bar \{([^}]+)\}/)[1];
  const overlay = base.match(/\.overlay\{([^}]+)\}/)[1];
  const layer = rule => Number(rule.match(/z-index:\s*(\d+)/)[1]);

  assert.match(header, /position: sticky/);
  assert.ok(layer(header) > layer(toolbar), "The header stacking context must clear the dashboard toolbar");
  assert.ok(layer(header) < layer(overlay), "Modal overlays must remain above the header");
});

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
