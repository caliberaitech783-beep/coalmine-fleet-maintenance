import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wide desktop top bar doubles and bolds its visible text without overlap", async () => {
  const css = await readFile(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(css, /@media \(min-width: 1601px\)/);
  assert.match(css, /\.app > aside \.caliber-app-name strong \{ font-size: 34px; font-weight: 900; \}/);
  assert.match(css, /\.app > aside nav > \.nav-config-row > button,[\s\S]*\.app > aside nav > \.masters-menu > \.nav-config-row > button \{ font-size: 30px; font-weight: 900; \}/);
  assert.match(css, /\.app > aside \.user b \{ font-size: 28px; font-weight: 900; \}/);
  assert.match(css, /\.app > aside \.user small \{ font-size: 26px; font-weight: 800; \}/);
  assert.match(css, /\.app > aside nav\s*\{[\s\S]*overflow-x:\s*auto;/);
});
