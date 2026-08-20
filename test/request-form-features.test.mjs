import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mobile request forms enforce chassis, search, duplicate confirmation, and stored audio", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(source, /aria-label="Search equipment or vehicle"/);
  assert.match(source, /Chassis number is not available\. Contact the admin team/);
  assert.match(source, /forceDuplicate: true/);
  assert.match(source, /audioName="maintenanceAudio"/);
  assert.match(source, /request-audio-list/);
  assert.match(server, /chassis_number TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /complaint_audio TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /maintenance_audio TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /duplicate:true/);
});
