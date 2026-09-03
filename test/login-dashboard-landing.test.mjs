import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("every successful login resets the application to Dashboard", () => {
  const start = source.indexOf("const completeLogin =");
  const end = source.indexOf("if (!session) return <Login", start);
  const completeLogin = source.slice(start, end);

  assert.ok(start >= 0, "completeLogin handler should exist");
  assert.match(completeLogin, /setActive\("Dashboard"\)/);
  assert.match(completeLogin, /pageHistory\.current = \["Dashboard"\]/);
  assert.match(completeLogin, /setCanGoBack\(false\)/);
  assert.match(completeLogin, /setSession\(nextSession\)/);
  assert.match(source, /<Login onLogin=\{completeLogin\}/);
});

test("normal user login starts on its dashboard section", () => {
  const start = source.indexOf("function Normal(");
  const end = source.indexOf("function App()", start);
  const normal = source.slice(start, end);

  assert.match(normal, /useState\(embedded\?"profile":"dashboard"\)/);
});
