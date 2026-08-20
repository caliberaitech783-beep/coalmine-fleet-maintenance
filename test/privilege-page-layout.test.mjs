import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("privilege list shows only username and user group", () => {
  assert.match(source, /displayFields = name === "Privilege" \? fields\.slice\(0, 2\) : fields/);
  assert.match(source, /className="privilege-user-link" onClick=\{\(\) => setEditing\(row\)\}/);
});

test("privilege user form includes all authority controls", () => {
  assert.match(source, /fields\.filter\(\(\[key\]\) => name !== "Privilege" \|\| key !== "username"\)/);
  assert.match(source, /"Production User": "Create request only"/);
  assert.match(source, /"Maintenance User": "Edit and delete requests"/);
  assert.match(source, /"MIS User": "Verify requests only"/);
});
