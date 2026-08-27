import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");

test("Idle is available throughout fleet KPIs, filters, status editing and site reports",()=>{
  assert.match(source,/>On-road, off-road and idle</);
  assert.match(source,/gotoEquipment\("idle"/);
  assert.match(source,/<option value="idle">Idle<\/option>/);
  assert.match(source,/<option value="Idle">Idle<\/option>/);
  assert.match(source,/Idle \$\{r\.idle\}/);
  assert.match(source,/\["Site","Total equipment","On road","Off road","Idle","Open breakdowns"\]/);
  assert.match(source,/<Equipment[\s\S]*initialFilter=\{equipmentFilter\}[\s\S]*initialLocation=\{equipmentLocation\}/);
  assert.doesNotMatch(source,/function Equipment\([\s\S]{0,120}requests = \[\]/);
});
