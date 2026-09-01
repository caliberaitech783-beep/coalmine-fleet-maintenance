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
  assert.match(styles, /\.header-clock \{[\s\S]*font: 900 25px\/1 Manrope/);
  assert.match(styles, /font-variant-numeric: tabular-nums/);
  assert.match(styles, /\.top > \.header-clock/);
  assert.match(styles, /\.normal-header-clock/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});
