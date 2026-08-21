import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("manager KPI and maintenance close form use the requested labels, cards, tooltips, and TAT",()=>{
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
  const manager=source.slice(source.indexOf("function ManagerDashboard"),source.indexOf("function Dashboard"));
  const closeForm=source.slice(source.indexOf("function CloseRequestForm"),source.indexOf("function VerifyRequestForm"));
  assert.match(source,/\["equipment", "Equipment group"\]/);
  assert.match(manager,/manager-kpi-tooltip/);
  assert.match(manager,/Equipment types/);
  assert.match(manager,/"Total equipment", fleet\.total[\s\S]*"Received for maintenance"/);
  assert.doesNotMatch(manager,/Awaiting parts/);
  assert.match(closeForm,/close-request-title/);
  assert.match(closeForm,/Turn around time \(TAT\)/);
  assert.doesNotMatch(closeForm,/<option>Awaiting parts<\/option>/);
  assert.match(server,/closed_at-started_at/);
});
