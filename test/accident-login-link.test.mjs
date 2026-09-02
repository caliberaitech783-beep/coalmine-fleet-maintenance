import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("login options include an icon-led Accident application link", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

  assert.match(source, /className="login-auth-link"/);
  assert.match(source, /href="https:\/\/bdms\.cmll\.in"/);
  assert.match(source, /<AlertTriangle \/>/);
  assert.match(source, /<span>Accident<\/span>/);
  assert.match(styles, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.login-auth-tab-icon\.accident/);
});
