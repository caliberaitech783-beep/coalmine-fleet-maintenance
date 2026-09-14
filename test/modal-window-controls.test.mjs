import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const modal = source.slice(source.indexOf("function Modal("), source.indexOf("function requestStartParts"));
const css = fs.readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

test("shared dialogs keep a close-only title bar", () => {
  assert.match(modal, /<header>\s*<h3>\{title\}<\/h3>\s*<button type="button" onClick=\{close\} aria-label="Close dialog">/);
  assert.doesNotMatch(modal, /modal-window-controls|Minimize window|Maximize window|windowState/);
  assert.doesNotMatch(css, /modal-minimized|modal-maximized|modal-window-controls/);
});

test("dialogs can be resized from the corner on desktop", () => {
  assert.match(css, /\.modal\{resize:both;min-width:min\(340px,100vw\);min-height:160px;max-width:100vw\}/);
  assert.match(css, /\.modal\{[^}]*overflow:auto/, "the resize handle needs a non-visible overflow");
  assert.match(css, /@media\(max-width:520px\)\{\.modal\{resize:none\}\}/);
});
