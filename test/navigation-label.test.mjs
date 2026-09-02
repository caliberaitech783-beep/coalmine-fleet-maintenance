import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {MOBILE_NAVIGATION_ITEMS, navigationLabel} from "../navigation-visibility.mjs";
import {ADMIN_SUBMENU_OPTIONS} from "../admin-access.mjs";

test("the daily site-wise menu is displayed in plural", () => {
  assert.equal(navigationLabel("Daily site-wise report"), "Daily site-wise reports");
  assert.equal(navigationLabel("Daily OEM report"), "Daily OEM report");
  assert.equal(navigationLabel("Unknown page"), "Unknown page");
});

test("renaming the display label leaves the stored access key untouched", () => {
  assert.equal(MOBILE_NAVIGATION_ITEMS.includes("Daily site-wise report"), true);
  assert.equal(ADMIN_SUBMENU_OPTIONS["WhatsApp Integration"].options.includes("Daily site-wise report"), true);
});

test("navigation, breadcrumb, page title and access checkboxes render the label", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /import \{navigationLabel\} from "\.\.\/navigation-visibility\.mjs";/);
  assert.match(source, /Operations <ChevronRight \/> <b>\{navigationLabel\(active\)\}<\/b>/);
  assert.match(source, /<span className="nav-label">\{navigationLabel\(name\)\}<\/span>/);
  assert.match(source, /<h1>\{navigationLabel\(type\)\}<\/h1>/);
  assert.match(source, /<span>\{navigationLabel\(option\)\}<\/span>/);
  assert.match(source, /<h2>Daily site-wise reports dispatch<\/h2>/);
});
