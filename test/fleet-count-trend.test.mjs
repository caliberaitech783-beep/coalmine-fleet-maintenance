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
  assert.deepEqual(JSON.parse(storage.data.get("k")), { day: "2026-09-11", open: 80, last: 80 });
  assert.deepEqual(trackCountChange(storage, "k", 79, "2026-09-11"), { open: 80, delta: -1, direction: "down" });
  assert.deepEqual(trackCountChange(storage, "k", 92, "2026-09-11"), { open: 80, delta: 12, direction: "up" });
  assert.deepEqual(JSON.parse(storage.data.get("k")), { day: "2026-09-11", open: 80, last: 92 }, "the opening stays fixed and the latest reading is kept as the running close");
});

test("a new day opens at the previous day's closing reading, like a stock's previous close", () => {
  const storage = memoryStorage({ k: JSON.stringify({ day: "2026-09-10", open: 75, last: 80 }) });
  assert.deepEqual(trackCountChange(storage, "k", 79, "2026-09-11"), { open: 80, delta: -1, direction: "down" });
  assert.deepEqual(JSON.parse(storage.data.get("k")), { day: "2026-09-11", open: 80, last: 79 });
});

test("a new day without a previous close opens at the first reading", () => {
  const storage = memoryStorage({ k: JSON.stringify({ day: "2026-09-10", open: 80 }) });
  assert.deepEqual(trackCountChange(storage, "k", 79, "2026-09-11"), { open: 79, delta: 0, direction: "flat" });
});

test("trackCountChange tolerates missing, corrupt, or throwing storage", () => {
  assert.deepEqual(trackCountChange(null, "k", 5), { open: 5, delta: 0, direction: "flat" });
  assert.deepEqual(trackCountChange(memoryStorage({ k: "{oops" }), "k", 5), { open: 5, delta: 0, direction: "flat" });
  assert.deepEqual(trackCountChange(memoryStorage({ k: "7" }), "k", 5), { open: 5, delta: 0, direction: "flat" });
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

test("the dashboard breakdown chip renders the live ticker and colours the count badge", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /trackCountChange\(.*BREAKDOWN_COUNT_STORAGE_KEY, liveBreakdownAssetCount\)/);
  assert.match(source, /const breakdownCountReady = equipmentLoaded && \(requestsUpdatedAt > 0 \|\| requests\.length > 0\);/, "the ticker waits for both equipment and requests to load");
  assert.match(source, /if \(!breakdownCountReady\) return;/);
  assert.doesNotMatch(source.slice(source.indexOf("function Dashboard(")), /managerDataReady/, "Dashboard must not reference the manager-only readiness flag");
  assert.match(source, /mine-fleet-count-trend \$\{breakdownCountChange\.direction\}/);
  assert.match(source, /formatCountDelta\(breakdownCountChange\.delta\)/);
  assert.match(source, /\$\{mode\} trend-\$\{breakdownCountChange\.direction\}/, "the chip carries the direction so the count badge can be coloured");
  const css = readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");
  assert.match(css, /\.mine-fleet-count-trend\.up \{[^}]*color: #c62828/);
  assert.match(css, /\.mine-fleet-count-trend\.down \{[^}]*color: #2e7d32/);
  assert.match(css, /\.mine-fleet-count-trend\.flat \{/);
  assert.match(css, /button\.trend-up b[^{]*\{[^}]*background: #c62828/, "a rising count badge is red");
  assert.match(css, /button\.trend-down b[^{]*\{[^}]*background: #2e7d32/, "a falling count badge is green");
  assert.equal(BREAKDOWN_COUNT_STORAGE_KEY, "fleetBreakdownCountOpen");
});
