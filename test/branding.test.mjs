import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("application chrome uses the approved Caliber transformation branding", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const manifest = fs.readFileSync(new URL("../public/site.webmanifest", import.meta.url), "utf8");
  const theme = fs.readFileSync(new URL("../src/brand-theme.css", import.meta.url), "utf8");
  const logo = new URL("../public/caliber-logo-reverse.png", import.meta.url);

  assert.equal(source.includes(">NC<"), false);
  assert.ok((source.match(/<CaliberBrand/g) ?? []).length >= 6);
  assert.match(source, /src="\/caliber-logo-reverse\.png"/);
  assert.equal(fs.existsSync(logo), true);
  assert.match(theme, /--brand-purple:\s*#522e90/i);
  assert.match(theme, /--brand-green:\s*#007d3f/i);
  assert.match(theme, /--brand-red:\s*#f04e53/i);
  assert.match(theme, /linear-gradient\(125deg,\s*#522e90[^;]+#f04e53/i);
  assert.match(manifest, /"short_name": "Nerve Center"/);
  assert.match(manifest, /"theme_color": "#522e90"/i);
});
