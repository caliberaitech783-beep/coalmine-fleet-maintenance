import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("superior is maintained on the user record and copied into new requests",()=>{
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
  assert.match(source,/function MaintenanceForm/);
  assert.match(source,/"Users & employees": \[[\s\S]*\["superior", "Superior", "multi-text"\]/);
  assert.match(source,/function MultiTextField/);
  assert.match(source,/Add another superior/);
  assert.match(source,/type === "multi-checkbox" \|\| type === "multi-text"/);
  const maintenanceForm=source.slice(source.indexOf("function MaintenanceForm"),source.indexOf("function RequestEditForm"));
  const verifyForm=source.slice(source.indexOf("function VerifyRequestForm"),source.indexOf("const ticketCategories"));
  assert.doesNotMatch(maintenanceForm,/name="superior"/);
  assert.doesNotMatch(verifyForm,/name="superior"/);
  assert.match(server,/ADD COLUMN IF NOT EXISTS superior_name TEXT NOT NULL DEFAULT ''/);
  assert.match(server,/superior_name AS superior/);
  assert.match(server,/superior_name,site,category/);
  assert.match(server,/const requester=await currentUserRecord\(req\.session\)/);
  assert.match(server,/const superior=String\(requester\.superior\|\|''\)/);
});
