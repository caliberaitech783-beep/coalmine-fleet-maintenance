import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Ideal requests require same-site Maintenance Manager approval before MIS",()=>{
  const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
  const client=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  assert.match(server,/ideal_requested_at TIMESTAMPTZ/);
  assert.match(server,/status='Ideal'/);
  assert.match(server,/managerRole!=='Maintenance Manager'/);
  assert.match(server,/lower\(trim\(site\)\)=lower\(trim\(\$3\)\)/);
  assert.match(server,/status='Closed',closed_at=NOW\(\)/);
  assert.match(server,/awaiting MIS verification/);
  assert.match(server,/status NOT IN \('Closed','Ideal'\)/);
  assert.match(client,/Ideal approvals \(\{idealRows\.length\}\)/);
  assert.match(client,/Make on road/);
  assert.match(client,/name="idealChoice"/);
  assert.match(client,/status: ideal \? "Ideal"/);
  assert.match(client,/includes\("was marked Ideal"\)/);
});
