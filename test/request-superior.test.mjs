import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("production and maintenance save superior and MIS can view it",()=>{
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
  assert.match(source,/function MaintenanceForm/);
  assert.match(source,/Superior[\s\S]*name="superior"/);
  assert.match(source,/superior: String\(fd\.get\("superior"\)/);
  assert.match(source,/function VerifyRequestForm[\s\S]*<span>Superior<\/span><b>\{request\.superior \|\| "—"\}<\/b>/);
  assert.match(server,/ADD COLUMN IF NOT EXISTS superior_name TEXT NOT NULL DEFAULT ''/);
  assert.match(server,/superior_name AS superior/);
  assert.match(server,/superior_name,site,category/);
});
