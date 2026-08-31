import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("selecting a master suppresses hover reopening until pointer leave", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(source, /setMastersSelectionClosed\(true\)/);
  assert.match(source, /onPointerLeave=\{\(\) => setMastersSelectionClosed\(false\)\}/);
  assert.match(source, /event\.currentTarget\.blur\(\)/);
  assert.match(css, /\.masters-menu:not\(\.selection-closed\):hover \.masters-dropdown/);
  assert.match(css, /\.masters-menu:not\(\.selection-closed\):focus-within \.masters-dropdown/);
});

test("reports opens as a graphical dropdown of report sub types", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

  assert.match(source, /const \[reportsOpen, setReportsOpen\] = useState\(false\)/);
  assert.match(source, /className=\{`masters-menu reports-menu/);
  assert.match(source, /<div className="masters-dropdown reports-dropdown" role="menu">/);
  assert.match(source, /setActive\(\{ page: "Reports", reportCategory: category\.id \}\)/);
  assert.match(source, /activeReportCategory=\{activeReportCategory\}/);
  assert.match(css, /\.reports-dropdown\{min-width:225px!important\}/);
});
