import assert from "node:assert/strict";
import test from "node:test";
import { fleetBreakdownCaseCounts } from "../dashboard-equipment-metrics.mjs";
import { fleetBreakdownCategory, fleetBreakdownRequests } from "../src/fleet-breakdown-drilldown.mjs";

const assets = [
  { door: "E1", category: "Equipment", currentLocation: "Sasti OB" },
  { door: "V1", category: "Vehicles", currentLocation: "Sasti OB" },
  { door: "V2", category: "Vehicles", currentLocation: "Jayant OB" },
];
const requests = [
  { ref: "E-open", door: "E1", site: "Sasti OB", status: "Open" },
  { ref: "E-second", door: "E1", site: "Sasti OB", status: "In Progress" },
  { ref: "V-open", door: "V1", site: "Sasti OB", status: "Pending" },
  { ref: "E-closed", door: "E1", site: "Sasti OB", status: " CLOSED " },
  { ref: "NCL-idle", door: "V2", site: "Jayant OB", status: "Idle" },
  { ref: "Unmatched-vehicle", reg: "MH34-NEW", site: "Sasti OB", status: "Open" },
  { ref: "Unmatched-equipment", site: "Sasti OB", status: "Open" },
];

test("breakdown details retain one row per counted open request, including repeated assets", () => {
  const rows = fleetBreakdownRequests(assets, requests);
  assert.equal(rows.length, fleetBreakdownCaseCounts(assets, requests).total);
  assert.deepEqual(rows.map((row) => row.ref), ["E-open", "E-second", "V-open", "NCL-idle", "Unmatched-vehicle", "Unmatched-equipment"]);
  assert.equal(requests.length, 7);
});

test("site and equipment/vehicle lists reconcile with their chart bars", () => {
  for (const site of ["Sasti OB", "Jayant OB"]) {
    const atSite = requests.filter((row) => row.site === site);
    const counts = fleetBreakdownCaseCounts(assets.filter((row) => row.currentLocation === site), atSite);
    for (const [category, key] of [["Equipment", "equipment"], ["Vehicles", "vehicles"]]) {
      const rows = fleetBreakdownRequests(assets, requests, { site, category });
      assert.equal(rows.length, counts[key]);
      assert.ok(rows.every((row) => fleetBreakdownCategory(assets, row) === category));
    }
  }
});

test("region and empty-site clicks keep only the selected breakdown scope", () => {
  assert.deepEqual(fleetBreakdownRequests(assets, requests, { sites: ["Jayant OB", "Dudhichua OB"] }).map((row) => row.ref), ["NCL-idle"]);
  assert.deepEqual(fleetBreakdownRequests(assets, requests, { site: "Dudhichua OB" }), []);
  assert.deepEqual(fleetBreakdownRequests(assets, requests, { sites: [] }), []);
  assert.deepEqual(fleetBreakdownRequests(assets, requests.filter((row) => row.status.trim().toLowerCase() === "closed")), []);
});
