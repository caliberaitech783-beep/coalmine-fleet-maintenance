import assert from "node:assert/strict";
import test from "node:test";
import { auditDeviceDetails } from "../device-details.mjs";

test("classifies computer platforms and browsers", () => {
  assert.deepEqual(auditDeviceDetails("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0"), {
    type: "Computer", platform: "Windows", browser: "Chrome",
  });
  assert.deepEqual(auditDeviceDetails("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Version/17.5 Safari/605.1.15"), {
    type: "Computer", platform: "macOS", browser: "Safari",
  });
});

test("classifies Android and iOS as mobile devices", () => {
  assert.deepEqual(auditDeviceDetails("Mozilla/5.0 (Linux; Android 15) Mobile Chrome/140.0"), {
    type: "Mobile", platform: "Android", browser: "Chrome",
  });
  assert.deepEqual(auditDeviceDetails("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1"), {
    type: "Mobile", platform: "iOS", browser: "Safari",
  });
});

test("keeps missing device evidence explicit", () => {
  assert.deepEqual(auditDeviceDetails(""), {type: "Unknown", platform: "Unknown", browser: "Unknown"});
});
