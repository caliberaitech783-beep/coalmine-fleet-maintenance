import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCountTrend, trackCountTrend, BREAKDOWN_COUNT_STORAGE_KEY } from "../src/fleet-count-trend.mjs";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), data };
}

test("resolveCountTrend reports up, down, or nothing", () => {
  assert.equal(resolveCountTrend(12, 80), "up");
  assert.equal(resolveCountTrend(80, 12), "down");
  assert.equal(resolveCountTrend(80, 80), null);
  assert.equal(resolveCountTrend(null, 80), null);
  assert.equal(resolveCountTrend(NaN, 80), null);
});

test("trackCountTrend compares with the last count seen in storage and stores the new one", () => {
  const storage = memoryStorage();
  assert.equal(trackCountTrend(storage, "k", 12), null, "first sighting has no baseline");
  assert.equal(trackCountTrend(storage, "k", 80), "up");
  assert.equal(storage.data.get("k"), "80");
  assert.equal(trackCountTrend(storage, "k", 80, "up"), "up", "unchanged count keeps the last arrow");
  assert.equal(trackCountTrend(storage, "k", 79), "down");
});

test("trackCountTrend tolerates missing or throwing storage", () => {
  assert.equal(trackCountTrend(null, "k", 5), null);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(trackCountTrend(broken, "k", 5, "down"), "down");
  assert.equal(trackCountTrend(memoryStorage(), "k", Number.NaN, "up"), "up");
});

test("the dashboard breakdown chip renders the stored-count trend arrow", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /trackCountTrend\(.*BREAKDOWN_COUNT_STORAGE_KEY, liveBreakdownAssetCount/);
  assert.match(source, /mine-fleet-count-trend \$\{breakdownCountTrend\}/);
  const css = readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");
  assert.match(css, /\.mine-fleet-count-trend\.up \{[^}]*color: #c62828/);
  assert.match(css, /\.mine-fleet-count-trend\.down \{[^}]*color: #2e7d32/);
  assert.equal(BREAKDOWN_COUNT_STORAGE_KEY, "fleetBreakdownCountSeen");
});
