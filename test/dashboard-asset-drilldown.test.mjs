import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard equipment and vehicle totals open category-filtered master rows", () => {
  assert.match(source, /gotoEquipment\("all", "", "equipment"\)[\s\S]*Total equipment/);
  assert.match(source, /Total vehicles[\s\S]*assetCounts\.vehicles/);
  assert.match(source, /gotoEquipment\("all", "", "vehicle"\)/);
  assert.match(source, /initialCategory=\{equipmentCategory\}/);
  assert.match(source, /assetCategory === "all" \|\| String\(v\.category \|\| ""\)\.trim\(\)\.toLowerCase\(\) === assetCategory/);
  assert.match(source, /<option value="equipment">Equipment<\/option>[\s\S]*<option value="vehicle">Vehicles<\/option>/);
});
