import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("login uses one account form and lets the saved user type choose the workspace", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  const login=source.slice(source.indexOf("function Login"),source.indexOf("function Side"));
  assert.doesNotMatch(login, /setRole|Choose your access role|Desktop View|Mobile View/);
  assert.match(source, /body: JSON\.stringify\(\{ username, password \}\)/);
  assert.match(login, /<h2>WELCOME BACK<\/h2>/);
  assert.match(source, /<b>One secure login<\/b>/);
  assert.doesNotMatch(server, /filterRowsByRequestedRole|requestedRole/);
  assert.match(server, /const loginRows=loginRecordCandidates\(userRows,username\)/);
});
