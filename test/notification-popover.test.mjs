import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("notification menu contains a close control and isolated scrolling list",()=>{
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const styles=fs.readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
  assert.match(source,/className="notification-popover" role="dialog"/);
  assert.match(source,/aria-label="Close notifications"/);
  assert.match(source,/className="notification-list"/);
  assert.match(styles,/\.notification-popover\{[^}]*display:flex;[^}]*overflow:hidden/);
  assert.match(styles,/\.notification-list\{[^}]*overflow-y:auto/);
  assert.match(styles,/\.notification-list>button span\{[^}]*position:static!important;[^}]*line-height:1\.45!important/);
});
