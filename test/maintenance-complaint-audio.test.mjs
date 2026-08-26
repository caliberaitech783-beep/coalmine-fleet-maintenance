import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("maintenance users can play production complaint audio", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.match(source, /showComplaintAudio && <th>Complaint audio<\/th>/);
  assert.match(source, /row\.complaintAudio \? <audio controls preload="none" src=\{row\.complaintAudio\}/);
  assert.match(source, /Production complaint audio/);
  assert.match(source, /isMaintenance[\s\S]*MobileWorkflowTable rows=\{activeRequests\}[\s\S]*showComplaintAudio/);
});
