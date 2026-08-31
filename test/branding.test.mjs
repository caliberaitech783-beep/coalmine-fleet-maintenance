import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("all visible application logo marks use NC branding", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const manifest = fs.readFileSync(new URL("../public/site.webmanifest", import.meta.url), "utf8");

  assert.equal(source.includes(">CM<"), false);
  assert.equal((source.match(/>NC</g) ?? []).length, 7);
  assert.match(manifest, /"short_name": "NC"/);
});
