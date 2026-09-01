import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/master-loader.css", import.meta.url), "utf8");

test("Caliber activity mark is centered inside the rotating loader ring", () => {
  assert.match(source, /function CaliberActivityMark/);
  assert.match(source, /className="caliber-activity-ring"/);
  assert.match(source, /src="\/app-icon\.png"/);
  assert.match(styles, /\.caliber-activity-ring[\s\S]*animation: master-loader-spin/);
  assert.match(styles, /\.caliber-activity-mark img[\s\S]*position: relative/);
});

test("branded activity feedback is used for master loading, import, and report downloads", () => {
  assert.match(source, /<CaliberActivityMark size="large" \/>/);
  assert.match(source, /<CaliberActivityMark size="small" \/>/);
  assert.match(source, /Preparing Excel report\.\.\./);
  assert.match(source, /Preparing PDF report\.\.\./);
  assert.match(source, /Preparing reports ZIP\.\.\./);
});
