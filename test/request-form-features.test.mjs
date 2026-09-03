import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mobile request forms enforce chassis, search, duplicate blocking, and stored audio", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(source, /aria-label="Search equipment or vehicle"/);
  assert.match(source, /Chassis number is not available\. Contact the admin team/);
  assert.match(source, /\/api\/requests\/conflict/);
  assert.match(source, /request-conflict-warning/);
  assert.match(source, /Already off road \/ under maintenance/);
  assert.doesNotMatch(source, /forceDuplicate: true/);
  assert.doesNotMatch(source, /Do you still want to add this request/);
  assert.match(source, /audioName="maintenanceAudio"/);
  assert.match(source, /request-audio-list/);
  assert.match(server, /chassis_number TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /complaint_audio TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /maintenance_audio TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /equipment_group TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /equipment_group AS "equipmentGroup"/);
  assert.match(server, /SET equipment_group=COALESCE/);
  assert.match(source, /equipmentGroup: equipmentDetails\.group \|\| equipmentGroup/);
  assert.match(source, /row\.equipmentGroup \|\| row\.equipment/);
  assert.match(source, /r\.equipmentGroup \|\| r\.equipment/);
  assert.match(server, /duplicate:true/);
  assert.match(server, /lower\(trim\(door_number\)\)/);
  assert.doesNotMatch(server, /forceDuplicate/);
});

test("the maintenance request form shows read-only make and model fetched from Equipment Master", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

  for (const field of ["make", "model"]) {
    const label = field[0].toUpperCase() + field.slice(1);
    // \s* rather than \n: main.jsx is stored with CRLF line endings.
    const block = source.match(new RegExp(`<label>\\s*${label}\\s*<input[^>]*>`));
    assert.ok(block, `expected a ${label} field in the request form`);
    assert.match(block[0], new RegExp(`value=\\{equipmentDetails\\.${field}\\}`));
    // Auto-filled from the selected equipment, never typed by the requester.
    assert.match(block[0], /readOnly/);
    // No name attribute keeps it out of the submitted FormData, like Chassis number.
    assert.doesNotMatch(block[0], /\sname=/);
    assert.match(block[0], /Not recorded in Equipment Master/);
  }

  // Make and model are informational: unlike chassis they must not block submission.
  assert.doesNotMatch(source, /Make is not available\. Contact the admin team/);
  assert.doesNotMatch(source, /Model is not available\. Contact the admin team/);
});
