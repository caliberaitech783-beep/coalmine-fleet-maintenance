import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("workflow date and time fields are system controlled and read only", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const fieldNames = ["date", "time", "closingDate", "closingTime", "firstTripDate", "firstTripTime"];

  for (const name of fieldNames) {
    const inputs = [...source.matchAll(new RegExp(`<input[^>]*name="${name}"[^>]*>`, "g"))];
    assert.ok(inputs.length, `${name} should be present`);
    for (const [input] of inputs) {
      assert.match(input, /\breadOnly\b/, `${name} must not be editable`);
      assert.doesNotMatch(input, /\bonChange=/, `${name} must not have an edit handler`);
    }
  }
});
