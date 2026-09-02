import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wide desktop top bar uses compact typography without horizontal overflow", async () => {
  const css = await readFile(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(css, /@media \(min-width: 1601px\)/);
  assert.match(css, /\.app > aside \.caliber-app-name strong \{ font-size: 15px; \}/);
  assert.match(css, /\.app > aside nav > \.nav-config-row > button,[\s\S]*\.app > aside nav > \.masters-menu > \.nav-config-row > button \{ font-size: 13px; \}/);
  assert.match(css, /\.app > aside \.user b \{ font-size: 12px; \}/);
  assert.match(css, /\.app > aside \.user small \{ font-size: 11px; \}/);
  assert.match(css, /\.app > aside nav\s*\{[\s\S]*overflow:\s*visible;/);
  assert.doesNotMatch(css, /font-size: (?:30|34)px/);
});
