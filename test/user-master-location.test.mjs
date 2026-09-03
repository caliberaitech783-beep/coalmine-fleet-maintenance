import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { userMasterLocation } from "../src/user-master-location.mjs";

test("user master location prefers a saved work location over report sites", () => {
  assert.equal(userMasterLocation({site:" Sasti OB ", location:"Other", managerSites:"Jayant OB"}), "Sasti OB");
  assert.equal(userMasterLocation({site:" ", location:"Dhoptala OB", managerSites:"Jayant OB"}), "Dhoptala OB");
  assert.equal(userMasterLocation({currentLocation:"Jayant OB"}), "Jayant OB");
});

test("desktop users display report sites without changing their permissions or assignment", () => {
  const record = Object.freeze({userType:"Super Admin", site:"", location:"", managerSites:"Sasti OB | Dhoptala OB", managerRegion:"WCL"});
  assert.equal(userMasterLocation(record), "Sasti OB | Dhoptala OB");
  assert.equal(record.site, "");
  assert.equal(record.managerRegion, "WCL");
  assert.equal(userMasterLocation({managerRegion:"All"}), "Not assigned");
  assert.equal(userMasterLocation({}), "Not assigned");
});

test("location display, filtering, sorting and export share the same user-only resolver", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /exportColumns = fields\?\.map[^\n]*name === "Users & employees" && key === "site" \? userMasterLocation\(record\)/);
  assert.match(source, /masterValue = \(record, key\) => \{\s*if \(name === "Users & employees" && key === "site"\) return userMasterLocation\(record\)/);
  assert.match(source, /useSortableRows\(filteredRows, "", \(record, key\) => \{\s*if \(name === "Users & employees" && key === "site"\) return userMasterLocation\(record\)/);
  assert.match(source, /const value = name === "Privilege"[^\n]*name === "Users & employees" && key === "site" \? userMasterLocation\(row\) : row\[key\]/);
});
