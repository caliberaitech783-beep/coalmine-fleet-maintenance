import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("signed-in headers render a bold live date and time clock", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(source, /function HeaderClock\(/);
  assert.match(source, /window\.setInterval\(updateClock, 1000\)/);
  assert.match(source, /window\.clearInterval\(timer\)/);
  assert.match(source, /currentDateTime\.getDate\(\)/);
  assert.match(source, /currentDateTime\.getHours\(\)/);
  assert.match(source, /currentDateTime\.getSeconds\(\)/);
  assert.match(source, /<HeaderClock \/>/);
  assert.match(source, /<HeaderClock className="normal-header-clock" \/>/);
  assert.match(styles, /\.header-clock \{[\s\S]*font: 900 var\(--header-clock-size\)\/1 Manrope/);
  assert.match(styles, /font-variant-numeric: tabular-nums/);
  assert.match(styles, /\.top > \.header-clock/);
  assert.match(styles, /\.normal-header-clock/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});

test("the header clock scales to fit every bar it is rendered in", () => {
  const styles = readFileSync(new URL("../src/topbar.css", import.meta.url), "utf8");
  const clockRule = styles.match(/\.header-clock \{[\s\S]*?\}/)[0];

  // Fluid size, never a fixed one, so the clock tracks the width of its bar.
  assert.match(clockRule, /--header-clock-size: clamp\(16px, 1\.45vw, 25px\);/);
  assert.doesNotMatch(clockRule, /font-size: \d+px/);

  // Nothing may force the clock wider than the bar that contains it.
  assert.match(clockRule, /min-width: 0;/);
  assert.match(clockRule, /max-width: 100%;/);

  // Icon and gap ride the same size token instead of fixed pixels.
  assert.match(styles, /\.header-clock svg \{[\s\S]*?width: 0\.88em;[\s\S]*?height: 0\.88em;/);
  assert.match(clockRule, /gap: 0\.44em;/);

  // Each placement retunes the token; none of them reintroduce a fixed font-size.
  assert.match(styles, /\.normal-header-clock \{\s*--header-clock-size: clamp\(15px, 1\.2vw, 20px\);/);
  assert.match(styles, /@media \(max-width: 1300px\)[\s\S]*?\.normal-header-clock \{ --header-clock-size: clamp\(16px, 2\.2vw, 22px\);/);
  for (const [, body] of styles.matchAll(/header-clock\b[^{}]*\{([^}]*)\}/g)) {
    assert.doesNotMatch(body, /font-size:\s*\d+px/);
  }
});

test("every signed-in time row remains visible while its page scrolls", () => {
  const styles = readFileSync(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(styles, /\.top \{\s*position: sticky;\s*top: 76px;\s*z-index: 9;/);
  assert.match(styles, /\.normal > header \{\s*position: sticky;\s*top: 0;\s*z-index: 12;/);
  assert.match(styles, /@media \(max-width: 1250px\)[\s\S]*?\.top \{\s*top: 0;/);
});
