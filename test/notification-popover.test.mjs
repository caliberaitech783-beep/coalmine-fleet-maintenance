import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("notification loading never opens the dropdown on login or polling", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const bell = source.slice(source.indexOf("function NotificationBell("), source.indexOf("function Normal("));
  const loading = bell.slice(bell.indexOf("const load ="), bell.indexOf("useEffect(() => {\n    if (!open)"));
  assert.match(bell, /\[open, setOpen\] = useState\(false\)/);
  assert.match(loading, /setItems\(next\)/);
  assert.match(loading, /window\.setInterval\(load, 30000\)/);
  assert.doesNotMatch(loading, /setOpen\(/);
  assert.match(bell, /onClick=\{toggle\}/);
  assert.equal(source.match(/<NotificationBell\b/g)?.length, 2);
});

test("notification menu contains a close control and isolated scrolling list",()=>{
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const styles=fs.readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
  assert.match(source,/className="notification-popover" role="dialog"/);
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
