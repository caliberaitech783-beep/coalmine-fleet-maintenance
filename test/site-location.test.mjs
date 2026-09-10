import test from "node:test";
import assert from "node:assert/strict";
import { assignedUserSiteName, canonicalSiteName, equipmentSiteName, recordBelongsToSite, recordsForSite } from "../site-location.mjs";

test("legacy WCL locations match their renamed dashboard sites", () => {
  assert.equal(canonicalSiteName("Sasti II"), canonicalSiteName("Sasti OB"));
  assert.equal(canonicalSiteName("SASTI"), canonicalSiteName("Sasti OB"));
  assert.equal(canonicalSiteName("Majri II"), canonicalSiteName("Majri OB"));
  assert.equal(canonicalSiteName("Majri"), canonicalSiteName("Majri OB"));
  assert.equal(
    canonicalSiteName("Dhoptala II"),
    canonicalSiteName("Dhoptala OB (2nd)"),
  );
  assert.equal(
    canonicalSiteName("DHOPTALA OB"),
    canonicalSiteName("Dhoptala OB (2nd)"),
  );
  assert.equal(
    canonicalSiteName("Gouri Pouni"),
    canonicalSiteName("Gauri Pauni OB (2nd)"),
  );
  assert.equal(
    canonicalSiteName("GOURI POUNI OB (2ND)"),
    canonicalSiteName("Gauri Pauni OB (2nd)"),
  );
  assert.equal(canonicalSiteName("Lalpeth II"), canonicalSiteName("Lalpeth OB"));
});

test("legacy NCL locations match once and do not duplicate Jayant", () => {
  assert.equal(canonicalSiteName("Jayant"), canonicalSiteName("Jayant OB"));
  assert.notEqual(canonicalSiteName("Jayant"), canonicalSiteName("Jayant OB 2nd"));
  assert.equal(
    canonicalSiteName("Dudhichua West"),
    canonicalSiteName("Dudhichua OB"),
  );
  assert.equal(
    canonicalSiteName("Dudhichua East"),
    canonicalSiteName("Dudhichua East OB"),
  );
});

test("site matching accepts equipment and maintenance-request location fields", () => {
  assert.equal(recordBelongsToSite({ currentLocation: "Sasti II" }, "Sasti OB"), true);
  assert.equal(recordBelongsToSite({ location: "Majri II" }, "Majri OB"), true);
  assert.equal(recordBelongsToSite({ site: "Sasti" }, "Sasti OB"), true);
  assert.equal(recordBelongsToSite({ currentLocation: "Jayant" }, "Jayant OB 2nd"), false);
});

test("mobile equipment options include only records at the user's current site", () => {
  const records = [
    { id: 1, equipmentName: "PL73", currentLocation: "LINGRAJ SIDING" },
    { id: 2, equipmentName: "PL74", currentLocation: "GOURI POUNI OB (2ND)" },
    { id: 3, equipmentName: "PL75", location: "Lingraj Siding" },
  ];

  assert.deepEqual(
    recordsForSite(records, "LINGRAJ SIDING").map((record) => record.id),
    [1, 3],
  );
  assert.deepEqual(recordsForSite(records, ""), []);
});

test("Majri dotted OB is a known alias without guessing a second site", () => {
  assert.equal(canonicalSiteName(" Majri O.B. "), "majri ob");
  assert.equal(canonicalSiteName("MAJRI O. B."), "majri ob");
  assert.notEqual(canonicalSiteName("Majri OB (2nd)"), "majri ob");
  assert.notEqual(canonicalSiteName("Majri 2nd"), "majri ob");
});

test("equipment site selection consistently prefers current location then legacy location", () => {
  const equipment = {currentLocation: "Majri OB", location: "Sasti OB", site: "Jayant OB"};
  assert.equal(equipmentSiteName(equipment), "Majri OB");
  assert.equal(recordBelongsToSite(equipment, "Majri"), true);
  assert.equal(recordBelongsToSite(equipment, "Sasti OB"), false);
  assert.equal(equipmentSiteName({...equipment, currentLocation: "  "}), "Sasti OB");
  assert.equal(equipmentSiteName({currentLocation: "", location: "\t", site: "Majri II"}), "Majri II");
  assert.equal(equipmentSiteName(null), "");
  assert.equal(recordBelongsToSite({}, ""), false);
  assert.equal(canonicalSiteName(null), "");
});

test("user site assignment is site-first and falls back past whitespace-only fields", () => {
  assert.equal(assignedUserSiteName({site: "Majri OB", location: "Sasti OB", currentLocation: "Jayant OB"}), "Majri OB");
  assert.equal(assignedUserSiteName({site: " ", location: "Sasti OB", currentLocation: "Jayant OB"}), "Sasti OB");
  assert.equal(assignedUserSiteName({site: "", location: "\t", currentLocation: " Majri II "}), "Majri II");
  assert.equal(assignedUserSiteName(null), "");
});
