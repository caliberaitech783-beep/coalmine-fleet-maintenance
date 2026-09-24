import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("notification loading never opens the dropdown on login or polling", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const bell = source.slice(source.indexOf("function NotificationBell("), source.indexOf("function Normal("));
  const openEffectIndex = bell.search(/useEffect\(\(\) => \{\r?\n    if \(!open\)/);
  const loading = bell.slice(bell.indexOf("const load ="), openEffectIndex);
  assert.match(bell, /\[open, setOpen\] = useState\(false\)/);
  assert.match(loading, /setItems\(next\)/);
  assert.match(bell, /createNotificationTracker\(\)/);
  assert.match(bell, /\?wait=1&known=/);
  assert.match(bell, /controller\.abort\(\)/);
  assert.doesNotMatch(loading, /setOpen\(/);
  assert.match(bell, /onClick=\{toggle\}/);
  assert.equal(source.match(/<NotificationBell\b/g)?.length, 2);
});

test("notification menu contains a close control and isolated scrolling list",()=>{
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const styles=fs.readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
  assert.match(source,/className=\{`notification-popover\$\{notificationOverlayMode \? " notification-popover-mobile" : ""\}`\} role="dialog"/);
  assert.match(source,/aria-label="Close notifications"/);
  assert.match(source,/className="notification-list"/);
  assert.match(styles,/\.notification-popover\{[^}]*display:flex;[^}]*overflow:hidden/);
  assert.match(styles,/\.notification-list\{[^}]*overflow-y:auto/);
  assert.match(styles,/\.notification-popover\{[^}]*background:#fff/);
  assert.match(styles,/\.notification-list>button\{[^}]*background:#fff!important/);
  assert.match(styles,/\.notification-list>button span\{[^}]*position:static!important;[^}]*line-height:1\.45!important/);
  const theme=fs.readFileSync(new URL("../src/theme.css",import.meta.url),"utf8");
  assert.match(theme,/data-theme="dark"[^\n]*\.notification-popover[^\n]*background:#111d30!important/);
});

test("notification menu becomes a portaled modal on narrow or touch screens",()=>{
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const mobile=fs.readFileSync(new URL("../src/mobile-compat.css",import.meta.url),"utf8");
  assert.match(source,/className="notification-scrim"/);
  assert.match(source,/aria-haspopup="dialog"/);
  assert.match(source,/window\.matchMedia\("\(max-width: 1250px\), \(hover: none\) and \(pointer: coarse\)"\)/);
  assert.match(source,/createPortal\(<div className="notification-overlay">[\s\S]*\{notificationPanel\}<\/div>, document\.body\)/);
  assert.match(source,/!centerRef\.current\?\.contains\(event\.target\) && !panelRef\.current\?\.contains\(event\.target\)/);
  assert.match(mobile,/\.notification-overlay \{[\s\S]*position: fixed;[\s\S]*z-index: 20000/);
  assert.match(mobile,/\.notification-overlay > \.notification-popover-mobile \{[\s\S]*bottom: max\(10px, env\(safe-area-inset-bottom\)\);[\s\S]*z-index: 1/);
});
