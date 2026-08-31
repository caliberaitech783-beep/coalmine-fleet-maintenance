import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("mobile workspaces display the correct role-specific header", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const normalWorkspace = source.slice(source.indexOf("function Normal"), source.indexOf("function App"));

  assert.match(normalWorkspace, /isProduction \? "Production Maintenance Request"/);
  assert.match(normalWorkspace, /isMaintenance \? "Maintenance workspace"/);
  assert.match(normalWorkspace, /: "MIS verification"/);
  assert.doesNotMatch(normalWorkspace, /isProduction \? "Maintenance requests"/);
});
