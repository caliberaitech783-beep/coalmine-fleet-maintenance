import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("MIS users and managers use location-scoped requests, TAT, and partitioned first-trip KPIs",()=>{
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
  const manager=source.slice(source.indexOf("function ManagerDashboard"),source.indexOf("function Dashboard"));
  assert.match(server,/assignedRole==='MIS User'[\s\S]*maintenance_requests WHERE lower\(trim\(site\)\)=lower\(trim\(\$1\)\)/);
  assert.match(server,/A location must be assigned before this MIS user can verify requests/);
  assert.match(server,/verified_at IS NULL[\s\S]*lower\(trim\(site\)\)=lower\(trim\(\$7\)\)/);
  assert.match(manager,/"Total requests", verifiedRequests\.length/);
  assert.doesNotMatch(manager,/"Pending verification"/);
  assert.doesNotMatch(manager,/\["Verified", verifiedRequests\.length/);
  assert.match(manager,/activeRows=activeManagerRole==="MIS Manager"\?pendingVerification:openRequests/);
  assert.match(manager,/historyRows=activeManagerRole==="MIS Manager"\?verifiedRequests:closedRequests/);
  assert.match(manager,/detailRows=queueTab==="history"\?historyRows:activeRows/);
  assert.match(manager,/showTurnaroundTime=\{activeManagerRole === "MIS Manager"\}/);
  assert.match(source,/showTurnaroundTime \? "Turn around time \(TAT\)" : "Downtime"/);
  assert.match(source,/isMis[\s\S]*<MobileWorkflowTable rows=\{visibleRows\} showTurnaroundTime/);
});
