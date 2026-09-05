import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("login uses one account form and lets the saved user type choose the workspace", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  const login=source.slice(source.indexOf("function Login"),source.indexOf("function Side"));
  assert.doesNotMatch(login, /setRole|Choose your access role|Desktop View|Mobile View/);
  assert.match(source, /body: JSON\.stringify\(\{ username, password \}\)/);
  assert.match(login, /<h2>Welcome Back<\/h2>/);
  assert.match(source, /<b>One secure login<\/b>/);
  assert.doesNotMatch(server, /filterRowsByRequestedRole|requestedRole/);
  assert.match(server, /const loginRows=loginRecordCandidates\(userRows,username\)/);
});

test("login password opens the full keyboard instead of the iOS telephone keypad", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const passwordInput = source.match(/<input id="login-password"[\s\S]*?\/>/)?.[0] || "";
  assert.match(passwordInput, /type=\{showPassword \? "text" : "password"\}/);
  assert.doesNotMatch(passwordInput, /inputMode="(?:tel|numeric|decimal)"/);
  assert.match(passwordInput, /autoCapitalize="none"/);
  assert.match(passwordInput, /autoCorrect="off"/);
});

test("login and reset usernames do not autocapitalize on mobile", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  for (const id of ["login-username", "reset-username"]) {
    const input = source.match(new RegExp(`<input id="${id}"[\\s\\S]*?\\/>`))?.[0] || "";
    assert.match(input, /autoCapitalize="none"/);
    assert.match(input, /autoCorrect="off"/);
  }
});

test("mobile layout supports iPhone safe areas and dynamic viewport height", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/mobile-compat.css", import.meta.url), "utf8");
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /font-size: 16px !important/);
  assert.match(css, /min-width: 44px/);
});

test("mobile dialogs support touch dismissal and accessibility", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /onPointerDown=\{\(e\) => e\.target === e\.currentTarget && close\(\)\}/);
  assert.match(source, /role="dialog" aria-modal="true"/);
  assert.match(source, /type="button" onClick=\{close\} aria-label="Close dialog"/);
  assert.doesNotMatch(source, /className="overlay" onMouseDown=/);
});
