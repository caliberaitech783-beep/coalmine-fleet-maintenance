import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("lifecycle Opened and Closed cards require the matching current status", () => {
  assert.match(source, /opened: locationBreakdowns\.filter\(\(record\) => String\(record\.status \|\| ""\)\.trim\(\)\.toLowerCase\(\) !== "closed"/);
  assert.match(source, /closed: locationBreakdowns\.filter\(\(record\) => String\(record\.status \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "closed"/);
});
