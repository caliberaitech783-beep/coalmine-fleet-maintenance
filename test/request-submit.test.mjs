import test from "node:test";
import assert from "node:assert/strict";
import { submitMaintenanceRequest } from "../request-submit.mjs";

test("request submission waits for the persistence handler", async () => {
  let completed = false;
  const result = await submitMaintenanceRequest(async (request) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    completed = true;
    return { ...request, status: "Open" };
  }, { ref: "REQ-1" });

  assert.equal(completed, true);
  assert.deepEqual(result, { ref: "REQ-1", status: "Open" });
});

test("request submission propagates server failures", async () => {
  await assert.rejects(
    () => submitMaintenanceRequest(async () => {
      throw new Error("Database unavailable");
    }, { ref: "REQ-2" }),
    /Database unavailable/,
  );
});
