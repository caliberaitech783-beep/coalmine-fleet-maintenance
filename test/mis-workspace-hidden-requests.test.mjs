import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("MIS workspace filters its tables, dashboard, reports, and Info Pulse", () => {
  assert.match(source, /const misWorkspaceRequests=useMemo\(\(\)=>requestsVisibleToMisWorkspace\(requests,isMis\)/);
  assert.match(source, /const misDashboardRequests=useMemo\(\(\)=>requestsVisibleToMisWorkspace\(dashboardRequests,isMis\)/);
  assert.match(source, /<Dashboard requests=\{misDashboardRequests\}/);
  assert.match(source, /isMis \? misWorkspaceRequests : dashboardRequests/);
  assert.match(source, /setRequests\(requestsVisibleToMisWorkspace\(Array\.isArray\(body\.requests\) \? body\.requests : \[\], role === "MIS User"\)\)/);
});
