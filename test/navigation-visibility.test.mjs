import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {MOBILE_NAVIGATION_ITEMS, normalizeMobileNavigationVisibility} from "../navigation-visibility.mjs";

test("all header menus and submenus default to visible on responsive mobile", () => {
  const settings = normalizeMobileNavigationVisibility();
  assert.equal(MOBILE_NAVIGATION_ITEMS.length, 17);
  assert.equal(Object.values(settings).every(Boolean), true);
});

test("only explicit mobile menu opt-outs are hidden", () => {
  const settings = normalizeMobileNavigationVisibility({"Equipment master": false, Reports: true, unknown: false});
  assert.equal(settings["Equipment master"], false);
  assert.equal(settings.Reports, true);
  assert.equal(Object.hasOwn(settings, "unknown"), false);
});

test("user records independently control desktop and responsive mobile navigation", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const access = fs.readFileSync(new URL("../admin-access.mjs", import.meta.url), "utf8");
  assert.match(source, /Selected menus for each view/);
  assert.match(source, /view="desktop"/);
  assert.match(source, /view="mobile"/);
  assert.match(source, /mobileTabAccess/);
  assert.match(source, /window\.matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(access, /navigationPermissionsForView/);
  assert.doesNotMatch(source, /className="mobile-nav-toggle"/);
});
