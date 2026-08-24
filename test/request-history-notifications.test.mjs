import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("request lifecycle has reason/status columns, closed history, and stakeholder notifications",()=>{
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
  const access=fs.readFileSync(new URL("../mobile-access.mjs",import.meta.url),"utf8");
  assert.match(source,/showReason \? \[\["complaint", "Reason"\]\]/);
  assert.match(source,/\["status", "Status"\]/);
  assert.match(source,/Closed history/);
  assert.match(source,/activeRequests=requests\.filter[\s\S]*!=="closed"/);
  assert.match(source,/historyRows=isMis\?closedRequests/);
  assert.match(source,/showReason=\{activeManagerRole === "Production Manager"\}/);
  assert.match(access,/"Closed history"/);
  assert.match(server,/async function requestStakeholderLogins/);
  assert.match(server,/profile\.permissions\.adminLevel==='Manager'\)recipients\.push\(login\)/);
  assert.match(server,/\['Production User','Maintenance User','MIS User'\]/);
  assert.match(server,/opened at \$\{requestNotificationTime\(startedAt\)\}/);
  assert.match(server,/closed at \$\{requestNotificationTime\(closedAt\)\}/);
});
