import assert from "node:assert/strict";
import test from "node:test";
import {activeOpenCases, openCasesBySite} from "../dashboard-open-cases.mjs";

test("groups active dashboard cases by site for drilldown", () => {
  const requests = [
    {ref: "REQ-1", site: "LINGRAJ SIDING", status: "Open"},
    {ref: "REQ-2", site: "Lingraj Siding", status: "Awaiting parts"},
    {ref: "REQ-3", site: "JAYANT OB", status: "In progress"},
    {ref: "REQ-4", site: "JAYANT OB", status: "Closed"},
    {ref: "REQ-5", site: "", status: "Open"},
  ];

  assert.deepEqual(activeOpenCases(requests).map((request) => request.ref), ["REQ-1", "REQ-2", "REQ-3", "REQ-5"]);
  assert.deepEqual(
    openCasesBySite(requests).map((group) => [group.label, group.requests.map((request) => request.ref)]),
    [
      ["LINGRAJ SIDING", ["REQ-1", "REQ-2"]],
      ["JAYANT OB", ["REQ-3"]],
      ["Not assigned", ["REQ-5"]],
    ],
  );
});
