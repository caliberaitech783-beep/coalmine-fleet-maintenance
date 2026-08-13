import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSiteName, recordBelongsToSite } from "../site-location.mjs";

test("legacy WCL locations match their renamed dashboard sites", () => {
  assert.equal(canonicalSiteName("Sasti II"), canonicalSiteName("Sasti OB"));
  assert.equal(canonicalSiteName("SASTI"), canonicalSiteName("Sasti OB"));
  assert.equal(canonicalSiteName("Majri II"), canonicalSiteName("Majri OB"));
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

test("site matching accepts current and legacy equipment location fields", () => {
  assert.equal(recordBelongsToSite({ currentLocation: "Sasti II" }, "Sasti OB"), true);
  assert.equal(recordBelongsToSite({ location: "Majri II" }, "Majri OB"), true);
  assert.equal(recordBelongsToSite({ currentLocation: "Jayant" }, "Jayant OB 2nd"), false);
});
