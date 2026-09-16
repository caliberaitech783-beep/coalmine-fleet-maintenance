import assert from "node:assert/strict";
import test from "node:test";
import {adaptiveRefreshInterval, mobileDataProfile, mobileTablePageSize} from "../src/mobile-performance.mjs";

const browser = ({mobile = false, coarse = false, saveData = false, effectiveType = "4g"} = {}) => ({
  navigator: {connection: {saveData, effectiveType}},
  matchMedia(query) {
    return {matches: query.includes("max-width") ? mobile : coarse};
  },
});

test("desktop polling keeps its existing cadence and renders every table row", () => {
  const win = browser();
  assert.deepEqual(mobileDataProfile(win), {mobile: false, constrained: false});
  assert.equal(adaptiveRefreshInterval(win, 10_000), 10_000);
  assert.equal(adaptiveRefreshInterval(win, 30_000), 30_000);
  assert.equal(mobileTablePageSize(win), 0);
});

test("phone polling is capped at one request per minute and tables start with 25 rows", () => {
  for (const win of [browser({mobile: true}), browser({coarse: true})]) {
    assert.deepEqual(mobileDataProfile(win), {mobile: true, constrained: false});
    assert.equal(adaptiveRefreshInterval(win, 10_000), 60_000);
    assert.equal(adaptiveRefreshInterval(win, 30_000), 60_000);
    assert.equal(mobileTablePageSize(win), 25);
  }
});

test("data saver and slow mobile networks use a two-minute minimum", () => {
  for (const win of [browser({saveData: true}), browser({effectiveType: "2g"}), browser({effectiveType: "slow-2g"})]) {
    assert.equal(mobileDataProfile(win).constrained, true);
    assert.equal(adaptiveRefreshInterval(win, 10_000), 120_000);
  }
});
