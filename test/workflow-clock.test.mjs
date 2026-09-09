import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { indiaWorkflowDateTimeParts } from "../src/workflow-clock.mjs";

test("workflow defaults use Indian date and second-accurate time across a day boundary", () => {
  assert.deepEqual(indiaWorkflowDateTimeParts(new Date("2026-09-08T20:14:37Z")), {date: "2026-09-09", time: "01:44:37"});
  for (const value of ["2026-09-09 01:44:37", "2026-09-09 · 01:44:37", "2026-09-09 Â· 01:44:37", "2026-09-08T20:14:37Z", "2026-09-09T01:44:37+05:30"]) {
    assert.deepEqual(indiaWorkflowDateTimeParts(value), {date: "2026-09-09", time: "01:44:37"});
  }
  assert.deepEqual(indiaWorkflowDateTimeParts("2026-09-09 01:44"), {date: "2026-09-09", time: "01:44:00"});
  assert.deepEqual(indiaWorkflowDateTimeParts("invalid", new Date("2026-09-08T20:14:37Z")), {date: "2026-09-09", time: "01:44:37"});
});

test("identical instants produce identical form fields on India, UTC and New York devices", () => {
  const moduleUrl = new URL("../src/workflow-clock.mjs", import.meta.url).href;
  for (const TZ of ["Asia/Kolkata", "UTC", "America/New_York"]) {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `import {indiaWorkflowDateTimeParts} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(indiaWorkflowDateTimeParts(new Date('2026-09-08T20:14:37Z'))));`], {encoding: "utf8", env: {...process.env, TZ}});
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), {date: "2026-09-09", time: "01:44:37"}, TZ);
  }
});

test("create, edit, close and MIS defaults use the shared clock without unlocking readonly times", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /const \{date: systemDate, time: systemTime\} = indiaWorkflowDateTimeParts\(openedAt\);/);
  assert.match(source, /function requestStartParts\(start\) \{\s*return indiaWorkflowDateTimeParts\(start \|\| new Date\(\)\);/);
  assert.match(source, /function CloseRequestForm[\s\S]*?const now = requestStartParts\(""\);/);
  assert.match(source, /function VerifyRequestForm[\s\S]*?const today = requestStartParts\(""\);/);
  const clockSources = source.slice(source.indexOf("function requestStartParts("), source.indexOf("function MaintenanceRemarks("));
  assert.doesNotMatch(clockSources, /getHours|getDate|getMonth/);
});
