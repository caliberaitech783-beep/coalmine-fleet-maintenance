import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {MOBILE_NAVIGATION_ITEMS, normalizeMobileNavigationVisibility} from "../navigation-visibility.mjs";

test("all header menus and submenus default to visible on responsive mobile", () => {
  const settings = normalizeMobileNavigationVisibility();
  assert.equal(MOBILE_NAVIGATION_ITEMS.length, 16);
  assert.equal(Object.values(settings).every(Boolean), true);
});

test("only explicit mobile menu opt-outs are hidden", () => {
  const settings = normalizeMobileNavigationVisibility({"Equipment master": false, Reports: true, unknown: false});
  assert.equal(settings["Equipment master"], false);
  assert.equal(settings.Reports, true);
  assert.equal(Object.hasOwn(settings, "unknown"), false);
});

test("desktop header exposes persistent mobile visibility checkboxes", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /className="mobile-nav-toggle"/);
  assert.match(source, /window\.matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(source, /fetch\("\/api\/navigation-settings"/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS app_settings/);
  assert.match(server, /app\.put\('\/api\/navigation-settings',requireSuper/);
});
