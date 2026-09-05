import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("maintenance users can play production complaint audio", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.match(source, /showComplaintAudio && workflowHeader\("complaintAudio", "Complaint audio"\)/);
  assert.match(source, /row\.complaintAudio \? <audio controls preload="none" src=\{row\.complaintAudio\}/);
  assert.match(source, /Production complaint audio/);
  assert.match(source, /isMaintenance[\s\S]*MobileWorkflowTable rows=\{activeRequests\}[\s\S]*showComplaintAudio/);
});

test("iOS can save complaint audio when browser speech transcription is unavailable", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.match(source, /if \(!Speech\) \{[\s\S]*audioOnlyMode\.current = true;[\s\S]*Recording audio… live transcription is unavailable/);
  assert.match(source, /preferredType = \["audio\/mp4", "audio\/webm;codecs=opus", "audio\/webm"\]/);
  assert.match(source, /if \(required\) setText\(\(current\) => current\.trim\(\) \? current : "Details recorded in the attached audio\."\)/);
});
