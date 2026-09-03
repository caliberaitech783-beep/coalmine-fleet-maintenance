import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mainSource = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styleSource = fs.readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

test("breakdown tables size columns from their widest header or cell content", () => {
  assert.match(mainSource, /<ActionsTable\s+className="breakdown-table-auto-fit"/);
  assert.match(
    styleSource,
    /\.breakdown-table-auto-fit\s*\{[^}]*width\s*:\s*max-content\s*;[^}]*min-width\s*:\s*100%\s*;[^}]*table-layout\s*:\s*auto/s,
  );
});
