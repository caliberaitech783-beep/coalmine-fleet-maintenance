import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("workflow date and time fields are read only except MIS first-trip verification", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const fieldNames = ["date", "time", "closingDate", "closingTime"];

  for (const name of fieldNames) {
    const inputs = [...source.matchAll(new RegExp(`<input[^>]*name="${name}"[^>]*>`, "g"))];
    assert.ok(inputs.length, `${name} should be present`);
    for (const [input] of inputs) {
      assert.match(input, /\breadOnly\b/, `${name} must not be editable`);
      assert.doesNotMatch(input, /\bonChange=/, `${name} must not have an edit handler`);
    }
  }

  for (const name of ["firstTripDate", "firstTripTime"]) {
    const inputs = [...source.matchAll(new RegExp(`<input[^>]*name="${name}"[^>]*>`, "g"))];
    assert.equal(inputs.length, 1, `${name} should only exist in the MIS verify form`);
    assert.doesNotMatch(inputs[0][0], /\breadOnly\b/, `${name} must be editable in the MIS verify form`);
    assert.doesNotMatch(inputs[0][0], /\bdisabled\b/, `${name} must be enabled in the MIS verify form`);
  }
});
