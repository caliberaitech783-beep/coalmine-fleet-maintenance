import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Accident and Accounts links sit beneath the logo", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/user-sessions.css", import.meta.url), "utf8");

  const proofRow = source.match(/<div className="login-application-links">[\s\S]*?<\/div>/);
  assert.ok(proofRow, "expected the login-proof row in the blue panel");

  // The link lives in the proof row, immediately after Secure access.
  assert.match(source, /<CaliberBrand className="login-brand"[^>]*\/>\s*<div className="login-application-links">/);
  assert.match(proofRow[0], /login-accounts-link/);
  assert.match(proofRow[0], /href="https:\/\/bdms\.cmll\.in"/);
  assert.match(proofRow[0], /<AlertTriangle \/>/);
  assert.match(proofRow[0], /<strong>Accident<\/strong>Open application/);
  assert.match(proofRow[0], /aria-label="Open Accident application"/);

  // It is no longer one of the sign-in tabs.
  const tabs = source.match(/function AuthModeTabs\([\s\S]*?\n\}/);
  assert.ok(tabs, "expected the AuthModeTabs component");
  assert.doesNotMatch(tabs[0], /Accident/);
  assert.doesNotMatch(source, /className="login-auth-link"/);
  // Scoped to the tabs rule: repeat(3,...) is used by many unrelated grids.
  assert.doesNotMatch(styles, /\.login-auth-tabs\{grid-template-columns:repeat\(3,/);

  // Styled as an actionable item on the dark panel.
  assert.match(styles, /\.login-application-links > a,\.login-application-links > button\{/);
  assert.match(styles, /\.login-application-links > :hover\{/);
  assert.match(styles, /\.login-application-links > :focus-visible\{/);
});

test("accident reporting stays reachable when the proof row is hidden on phones", async () => {
  const styles = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

  // The 900px breakpoint hides .login-proof; a later rule must bring it back
  // with only the accident link showing, or field users lose the entry point.
  const hide = styles.indexOf(".login-message .eyebrow,.login-message>p,.login-proof,.mine-art,.login-environment{display:none}");
  assert.notEqual(hide, -1, "expected the mobile rule that hides the proof row");

  const restore = styles.indexOf(".login-proof{display:flex;margin:16px 0 0;padding:0;border-top:0}");
  assert.notEqual(restore, -1, "expected the mobile rule that restores the accident link");
  assert.ok(restore > hide, "the restoring rule must come after the hiding rule to win the cascade");
  assert.match(styles, /\.login-proof>div\{display:none\}/);
});
