import test from "node:test";
import assert from "node:assert/strict";
import { requestsVisibleToSession, requestsVisibleGlobally } from "../mis-request-visibility.mjs";

const oldRows = ["Open", "Accepted", "In progress", "Closed", "Idle", "Ideal", "Verified"].map((status, i) => ({ ref: `REQ-OLD-${i}`, site: "Dudhichua OB", createdAt: "2026-09-22 15:00:00", status }));
const keep = [
  { site: "Dudhichua OB", createdAt: "2026-09-23 10:34:19", start: "2026-09-01 00:00:00" },
  { site: "Dudhichua East OB", createdAt: "2026-09-22 15:00:00" },
  { site: "Majri OB", createdAt: "2026-09-22 15:00:00" },
];
test("existing Dudhichua requests of every status are hidden only from the three operational roles", () => {
  for (const assignedRole of ["Production User", "Maintenance User", "MIS User"]) {
    assert.deepEqual(requestsVisibleToSession([...oldRows, ...keep], { role: "normal", assignedRole }), keep);
  }
});
test("Admin, manager, other roles and global records remain unchanged", () => {
  for (const session of [{role:"super", permissions:{adminLevel:"Admin"}}, {role:"super", assignedRole:"MIS User"}, {role:"normal", assignedRole:"General User"}]) {
    assert.deepEqual(requestsVisibleToSession(oldRows, session), oldRows);
  }
  assert.deepEqual(requestsVisibleGlobally(oldRows), oldRows);
});
test("cutoff handles IST and zoned creation timestamps and preserves unknown dates", () => {
  const rows = [
    {site:"Dudhichua West", createdAt:"2026-09-23 10:34:18"},
    {site:"Dudhichua OB", createdAt:"2026-09-23T05:04:18Z"},
    {site:"Dudhichua OB", createdAt:"2026-09-23T05:04:19Z"},
    {site:"Dudhichua OB"},
  ];
  assert.deepEqual(requestsVisibleToSession(rows, {role:"normal", assignedRole:"Production User"}), rows.slice(2));
});
