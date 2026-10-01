import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const lifecycle = main.slice(main.indexOf("  const requestLifecycleRows ="), main.indexOf("  // Keep all six compact series"));

test("request lifecycle aggregates rows and daily counts without scanning every row per date", () => {
  assert.match(lifecycle, /for \(const record of locationBreakdowns\)/);
  assert.match(lifecycle, /dateCounts\[metric\]\.set/);
  assert.match(lifecycle, /misLifecycleDateCounts\.get\(date\)/);
  assert.doesNotMatch(lifecycle, /requestTrendDateKeys\.map[\s\S]*requestLifecycleRows\.[a-z]+\.filter/);
});

test("unchanged long-poll responses do not commit a new notification list", () => {
  assert.match(main, /revision !== itemsRevisionRef\.current/);
});

test("production build separates framework, icons and large reporting libraries", () => {
  const config = readFileSync(new URL("../vite.config.mjs", import.meta.url), "utf8");
  for (const chunk of ["react-vendor", "icons", "pdf-vendor", "image-export-vendor", "replay-vendor"]) assert.match(config, new RegExp(`return "${chunk}"`));
});
