import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the colored top bar increases text by two pixels at each responsive size", async () => {
  const css = await readFile(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(css, /@media \(min-width: 1601px\)/);
  assert.match(css, /\.app > aside \.caliber-app-name strong \{ font-size: 17px; \}/);
  assert.match(css, /\.app > aside nav > \.nav-config-row > button,[\s\S]*\.app > aside nav > \.masters-menu > \.nav-config-row > button \{ font-size: 15px; \}/);
  assert.match(css, /\.app > aside \.user b \{ font-size: 14px; \}/);
  assert.match(css, /\.app > aside \.user small \{ font-size: 13px; \}/);
  const laptop = css.slice(css.indexOf('@media (max-width: 1600px) and (min-width: 1251px)'), css.indexOf('.app > .content'));
  assert.match(laptop, /\.caliber-app-name strong\s*\{\s*font-size: 14px;/);
  assert.match(laptop, /nav button\s*\{[^}]*font-size: 13px;/);
  const base = css.slice(0, css.indexOf('@media (max-width: 1600px)'));
  assert.match(base, /\.caliber-app-name strong \{ font-size: 16px;/);
  assert.match(base, /\.caliber-app-name small \{ font-size: 9px;/);
  assert.match(base, /nav button\s*\{[^}]*font-size: 15px;/);
  assert.match(css, /\.app > aside nav\s*\{[\s\S]*overflow:\s*visible;/);
  assert.doesNotMatch(css, /font-size: (?:30|34)px/);
});
