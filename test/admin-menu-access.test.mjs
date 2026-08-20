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
