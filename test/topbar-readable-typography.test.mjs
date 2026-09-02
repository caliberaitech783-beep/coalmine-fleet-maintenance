import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wide desktop top bar enlarges only its visible text", async () => {
  const css = await readFile(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(css, /@media \(min-width: 1601px\)/);
  assert.match(css, /\.app > aside \.caliber-app-name strong \{ font-size: 17px; \}/);
  assert.match(css, /\.app > aside nav > \.nav-config-row > button,[\s\S]*\.app > aside nav > \.masters-menu > \.nav-config-row > button \{ font-size: 15px; \}/);
  assert.match(css, /\.app > aside \.user b \{ font-size: 14px; \}/);
  assert.match(css, /\.app > aside \.user small \{ font-size: 13px; \}/);
});
