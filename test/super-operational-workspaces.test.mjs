import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("Super User header exposes every operational workspace", () => {
  assert.match(source, /const operationalWorkspaceNav = \[[\s\S]*Production workspace[\s\S]*Maintenance workspace[\s\S]*MIS workspace/);
  assert.match(source, />\s*Operational Workspaces\s*</);
  assert.match(source, /operationalWorkspaceNav\.map/);
});

test("operational workspaces render their full workflow inside the Super User profile", () => {
  assert.match(source, /selectedOperationalRole[\s\S]*assignedRole: selectedOperationalRole/);
  assert.match(source, /<Normal[\s\S]*embedded[\s\S]*session=\{operationalSession\}/);
  assert.match(source, /!embedded && <header/);
});

test("Admins can execute operational actions while Managers cannot bypass role gates", () => {
  assert.match(server, /req\.session\?\.role===['"]super['"]&&req\.session\?\.permissions\?\.adminLevel===['"]Manager['"]/);
  assert.match(source, /permissions\.adminLevel !== "Manager"[\s\S]*Operational Workspaces/);
});
