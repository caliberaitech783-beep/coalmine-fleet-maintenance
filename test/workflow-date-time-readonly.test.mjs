import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("workflow date and time fields are read only except MIS and Production first-trip entry", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const fieldNames = ["date", "time", "closingDate", "closingTime"];

  for (const name of fieldNames) {
    const inputs = [...source.matchAll(new RegExp(`<(?:input|DateInput|TwelveHourTimeInput)[^>]*name="${name}"[^>]*>`, "g"))];
    assert.ok(inputs.length, `${name} should be present`);
    for (const [input] of inputs) {
      if (!/\btype="hidden"/.test(input)) {
        assert.match(input, /\breadOnly\b/, `${name} must not be editable`);
      }
      assert.doesNotMatch(input, /\bonChange=/, `${name} must not have an edit handler`);
    }
  }

  for (const name of ["firstTripDate", "firstTripTime"]) {
    const inputs = [...source.matchAll(new RegExp(`<(?:input|DateInput|TwelveHourTimeInput)[^>]*name="${name}"[^>]*>`, "g"))];
    assert.equal(inputs.length, 2, `${name} should exist in the MIS and Production first-trip forms`);
    for (const [input] of inputs) {
      assert.doesNotMatch(input, /\breadOnly\b/, `${name} must be editable in both first-trip forms`);
      assert.doesNotMatch(input, /\bdisabled\b/, `${name} must be enabled in both first-trip forms`);
    }
  }
});
