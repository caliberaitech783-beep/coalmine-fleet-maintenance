import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Received for maintenance says from which date the intake total runs", () => {
  assert.ok(source.includes('const maintenanceIntakeSince = scopedRequests.map((request) => String(request.start || "").trim()).filter(Boolean).sort()[0] || "";'));
  assert.ok(source.includes('["Received for maintenance", scopedRequests.length, maintenanceIntakeSince ? `Total maintenance intake since ${formatDisplayDate(maintenanceIntakeSince)}` : "Total maintenance intake"'));
});
