import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Breakdown master enables complaint and maintenance audio columns", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.match(source, /Breakdown = function BreakdownWithMasterEntry[\s\S]*<BreakdownTable rows=\{filteredRows\} stickyHeader showAudio showMakeModel actionsBesideSearch statusPanelId=/);
  assert.match(source, /\["audio", "Audio clips"\]/);
});
