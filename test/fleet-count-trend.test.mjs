import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCountTrend, trackCountChange, formatCountDelta, localDayKey, BREAKDOWN_COUNT_STORAGE_KEY } from "../src/fleet-count-trend.mjs";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), data };
}

test("resolveCountTrend reports up, down, or nothing", () => {
  assert.equal(resolveCountTrend(12, 80), "up");
  assert.equal(resolveCountTrend(80, 12), "down");
  assert.equal(resolveCountTrend(80, 80), null);
  assert.equal(resolveCountTrend(null, 80), null);
});

test("trackCountChange measures the live count against today's opening reading", () => {
  const storage = memoryStorage();
  assert.deepEqual(trackCountChange(storage, "k", 80, "2026-09-11"), { open: 80, delta: 0, direction: "flat" });
  assert.deepEqual(JSON.parse(storage.data.get("k")), { day: "2026-09-11", open: 80 });
  assert.deepEqual(trackCountChange(storage, "k", 79, "2026-09-11"), { open: 80, delta: -1, direction: "down" });
  assert.deepEqual(trackCountChange(storage, "k", 92, "2026-09-11"), { open: 80, delta: 12, direction: "up" });
  assert.equal(JSON.parse(storage.data.get("k")).open, 80, "the opening reading stays fixed through the day");
});

test("trackCountChange starts a fresh opening reading on a new day", () => {
  const storage = memoryStorage({ k: JSON.stringify({ day: "2026-09-10", open: 80 }) });
  assert.deepEqual(trackCountChange(storage, "k", 79, "2026-09-11"), { open: 79, delta: 0, direction: "flat" });
  assert.deepEqual(JSON.parse(storage.data.get("k")), { day: "2026-09-11", open: 79 });
});

test("trackCountChange tolerates missing, corrupt, or throwing storage", () => {
  assert.deepEqual(trackCountChange(null, "k", 5), { open: 5, delta: 0, direction: "flat" });
  assert.deepEqual(trackCountChange(memoryStorage({ k: "{oops" }), "k", 5), { open: 5, delta: 0, direction: "flat" });
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(trackCountChange(broken, "k", 5), { open: 5, delta: 0, direction: "flat" });
  assert.equal(trackCountChange(memoryStorage(), "k", Number.NaN), null);
});

test("formatCountDelta and localDayKey render ticker text", () => {
  assert.equal(formatCountDelta(12), "+12");
  assert.equal(formatCountDelta(-1), "−1");
  assert.equal(formatCountDelta(0), "0");
  assert.equal(formatCountDelta(1200), "+1,200");
  assert.equal(localDayKey(new Date(2026, 8, 11, 23, 59)), "2026-09-11");
});

test("the dashboard breakdown chip renders the live ticker", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /trackCountChange\(.*BREAKDOWN_COUNT_STORAGE_KEY, liveBreakdownAssetCount\)/);
  assert.match(source, /if \(!managerDataReady\) return;/, "the ticker waits for both equipment and requests to load");
  assert.match(source, /mine-fleet-count-trend \$\{breakdownCountChange\.direction\}/);
  assert.match(source, /formatCountDelta\(breakdownCountChange\.delta\)/);
  const css = readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");
  assert.match(css, /\.mine-fleet-count-trend\.up \{[^}]*color: #c62828/);
  assert.match(css, /\.mine-fleet-count-trend\.down \{[^}]*color: #2e7d32/);
  assert.match(css, /\.mine-fleet-count-trend\.flat \{/);
  assert.equal(BREAKDOWN_COUNT_STORAGE_KEY, "fleetBreakdownCountOpen");
});
