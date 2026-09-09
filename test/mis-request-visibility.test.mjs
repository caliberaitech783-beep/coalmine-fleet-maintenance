import assert from "node:assert/strict";
import test from "node:test";
import { MIS_HIDDEN_REQUEST_REFERENCES, requestsVisibleToSession } from "../mis-request-visibility.mjs";

const rows = [
  { ref: "REQ-1787994776734" },
  { ref: "REQ-1787994588710" },
  { ref: "REQ-1787759984730" },
  { ref: "REQ-KEEP-VISIBLE" },
];

test("only the three specified requests are hidden from MIS users", () => {
  assert.equal(MIS_HIDDEN_REQUEST_REFERENCES.size, 3);
  assert.deepEqual(
    requestsVisibleToSession(rows, { role: "normal", assignedRole: "MIS User" }),
    [{ ref: "REQ-KEEP-VISIBLE" }],
  );
});

test("the same requests remain visible to every other role", () => {
  for (const session of [
    { role: "normal", assignedRole: "Production User" },
    { role: "normal", assignedRole: "Maintenance User" },
    { role: "super", assignedRole: "MIS User", permissions: { adminLevel: "Manager" } },
  ]) assert.deepEqual(requestsVisibleToSession(rows, session), rows);
});
