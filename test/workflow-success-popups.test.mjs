import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

test("successful workflow actions show the requested popup notifications", () => {
  assert.match(source, /await onCreate\(request\);[\s\S]*?setCreatedRequestRef\("Request Submitted"\)/);
  assert.match(source, /acceptingVehicle[\s\S]*?await onUpdateRequest\(payload\.ref, payload\);[\s\S]*?setCreatedRequestRef\("Vehicle Accepted"\)/);
  assert.match(source, /await onUpdateRequest\(closing\.ref, payload, "close"\);[\s\S]*?setCreatedRequestRef\("Vehicle Has Been On road"\)/);
  assert.match(source, /await onUpdateRequest\(verifying\.ref, payload, "verify"\);[\s\S]*?setCreatedRequestRef\("Vehicle Verified"\)/);
  assert.match(source, /className="workflow-success-popup"[\s\S]*?role="status" aria-live="polite"/);
  assert.match(styles, /\.workflow-success-popup\{position:fixed/);
});
