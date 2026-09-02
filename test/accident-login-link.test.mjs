import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the Accident application link sits in the blue panel beside Secure access", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

  const proofRow = source.match(/<div className="login-proof">[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(proofRow, "expected the login-proof row in the blue panel");

  // The link lives in the proof row, immediately after Secure access.
  assert.match(proofRow[0], /Secure access<\/strong>Role-based control<\/span><\/div>\s*<a className="login-accident-link"/);
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
  assert.match(styles, /\.login-proof>\.login-accident-link\{/);
  assert.match(styles, /\.login-proof>\.login-accident-link:hover\{/);
  assert.match(styles, /\.login-proof>\.login-accident-link:focus-visible\{/);
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
