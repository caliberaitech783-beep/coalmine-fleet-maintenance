import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

test("Info Pulse request details escape animated rows above the pulse overlay", () => {
  const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/info-pulse-content.css", import.meta.url), "utf8");
  assert.match(main, /function InfoPulseTimelineModal[\s\S]*?return createPortal\(<Modal[\s\S]*?pulse-timeline-overlay[\s\S]*?document.body\)/);
  assert.match(main, /<InfoPulseContent[^\n]*Dialog=\{InfoPulseTimelineModal\}/);
  assert.match(css, /\.overlay\.pulse-timeline-overlay \{ z-index: 10002; \}/);
});
