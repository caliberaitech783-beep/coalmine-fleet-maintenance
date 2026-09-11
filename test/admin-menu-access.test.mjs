import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("admin navigation and user forms use the same access allowlists", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(source, /visibleMasterNav = masterNav\.filter/);
  assert.match(source, /canViewWhatsApp = accessAllows/);
  assert.match(source, /Visible masters/);
  assert.match(source, /Visible tabs/);
  assert.match(server, /You do not have access to this master/);
  assert.match(server, /You do not have access to WhatsApp Integration/);
});

test("Report Setting is managed from the protected Admin menu instead of Reports", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /const adminNav = \[[\s\S]*?\["Report Setting", Settings\][\s\S]*?\["Audit Trail", History\]/);
  assert.match(source, /if\(name==="Report Setting"\)return isAdministrator/);
  assert.match(source, /active === "Report Setting"[\s\S]*?<WhatsAppReportSettingsDialog/);
  const reportsPage = source.slice(source.indexOf("function ReportsPage("), source.indexOf("function MasterPage("));
  assert.doesNotMatch(reportsPage, /WhatsAppReportSettings/);
});
