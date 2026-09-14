import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const modal = source.slice(source.indexOf("function Modal("), source.indexOf("function requestStartParts"));
const css = fs.readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

test("every shared dialog has minimize, maximize/restore and close buttons in its title bar", () => {
  assert.match(modal, /const \[windowState, setWindowState\] = useState\("normal"\)/);
  assert.match(modal, /<div className="modal-window-controls">/);
  assert.match(modal, /aria-label=\{minimized \? "Restore window" : "Minimize window"\}/);
  assert.match(modal, /aria-label=\{maximized \? "Restore window size" : "Maximize window"\}/);
  assert.match(modal, /type="button" onClick=\{close\} aria-label="Close dialog"/);
  assert.match(modal, /<header onDoubleClick=\{toggleMaximized\} onClick=\{minimized \? toggleMinimized : undefined\}>/);
});

test("minimized dialogs release the page behind them and stop trapping keys", () => {
  assert.match(modal, /if \(!minimized\) return undefined;\s*const previousOverflow = document\.body\.style\.overflow;\s*document\.body\.style\.overflow = "";/);
  assert.match(modal, /if \(dialog\.classList\?\.contains\("modal-minimized"\)\) return;/);
  assert.match(modal, /e\.target === e\.currentTarget && !minimized && close\(\)/);
});

test("dialogs can be resized from the corner and fill the screen when maximized", () => {
  assert.match(css, /\.modal\{resize:both;min-width:min\(340px,100vw\);min-height:160px;max-width:100vw\}/);
  assert.match(css, /\.modal\{[^}]*overflow:auto/, "the resize handle needs a non-visible overflow");
  assert.match(css, /\.modal\.modal-maximized\{width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;border-radius:0;resize:none\}/);
  assert.match(css, /\.overlay\.overlay-minimized\{background:transparent;pointer-events:none;place-items:end start;/);
  assert.match(css, /\.modal\.modal-minimized>:not\(header\)\{display:none\}/);
  assert.match(css, /@media\(max-width:520px\)\{\.modal\{resize:none\}\}/);
});
