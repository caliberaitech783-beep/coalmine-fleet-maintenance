import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchesSmartSearch, normalizeSearchText } from "../smart-search.mjs";

test("smart search ignores case, punctuation, spacing, and accents", () => {
  assert.equal(normalizeSearchText("  SÁSTI—OB / 2ND  "), "sasti ob 2nd");
  assert.equal(matchesSmartSearch("mh01 aa", "Registration MH-01-AA-1010"), true);
  assert.equal(matchesSmartSearch("sasti 2nd", "Sásti OB", "2ND shift"), true);
});

test("smart search matches every token across fields in any order", () => {
  const record = { equipment: "Hydraulic Excavator", door: "EX-17", site: "Jayant OB" };
  assert.equal(matchesSmartSearch("jayant ex17", record), true);
  assert.equal(matchesSmartSearch("excavator jayant", record), true);
  assert.equal(matchesSmartSearch("jayant dozer", record), false);
  assert.equal(matchesSmartSearch("", record), true);
});

test("every active portal search is wired to the shared smart matcher", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /import \{ matchesSmartSearch \} from "\.\.\/smart-search\.mjs"/);
  assert.doesNotMatch(source, /Object\.values\([^)]*\)\.join\(" "\)\.toLowerCase\(\)\.includes/);
  assert.match(source, /data-smart-search/);
  assert.match(source, /aria-label="Focus page smart search"/);
  assert.match(source, /visibleEquipmentVehicleRecords = equipmentVehicleRecords\.filter[\s\S]*matchesSmartSearch\(equipmentSearch/);
});
