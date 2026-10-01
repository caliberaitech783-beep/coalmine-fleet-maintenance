import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("menu visibility follows explicit open state, not hover or retained focus", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/topbar.css", import.meta.url), "utf8");

  assert.match(source, /setMastersSelectionClosed\(true\)/);
  assert.match(source, /onPointerLeave=\{\(\) => setMastersSelectionClosed\(false\)\}/);
  assert.match(source, /event\.currentTarget\.blur\(\)/);
  assert.doesNotMatch(css, /\.masters-menu[^\n]*(?:hover|focus-within)[^\n]*\.masters-dropdown/);
  assert.match(css, /\.masters-menu\.open > \.masters-dropdown/);
});

test("every desktop submenu closes after one of its destinations is selected", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

  for (const menu of ["Whatsapp", "Workspaces", "Admin"]) {
    assert.match(source, new RegExp(`const \\[${menu.toLowerCase()}SelectionClosed, set${menu}SelectionClosed\\] = useState\\(false\\)`));
    assert.match(source, new RegExp(`onPointerLeave=\\{\\(\\) => set${menu}SelectionClosed\\(false\\)\\}`));
  }
  assert.match(source, /const selectDropdownPage = \(page, event, setSelectionClosed\) => \{[\s\S]*?setSelectionClosed\(true\);[\s\S]*?event\.currentTarget\.blur\(\);/);
  assert.match(source, /selectDropdownPage\(page, event, setWhatsappSelectionClosed\)/);
  assert.match(source, /selectDropdownPage\(name, event, setWorkspacesSelectionClosed\)/);
  assert.match(source, /selectDropdownPage\(name,event,setAdminSelectionClosed\)/);
  assert.match(source, /event\.currentTarget\.blur\(\)/);
});

test("reports opens as a graphical dropdown of report sub types", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

  assert.match(source, /const \[reportsOpen, setReportsOpen\] = useState\(false\)/);
  assert.match(source, /className=\{`masters-menu reports-menu/);
  assert.match(source, /<div className="masters-dropdown reports-dropdown" role="menu">/);
  assert.match(source, /setActive\(\{ page: "Reports", reportCategory: category\.id \}\)/);
  assert.match(source, /activeReportCategory=\{activeReportCategory\}/);
  assert.match(css, /\.reports-dropdown\{min-width:225px!important\}/);
});

test("switching any top-level menu closes its peers and selecting a report closes all menus", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const names = ["Masters", "Whatsapp", "Workspaces", "Reports", "Admin", "Cdir", "Iboss"];
  const state = Object.fromEntries(names.map(name => [name, false]));
  const setters = names.map(name => value => {state[name] = typeof value === 'function' ? value(state[name]) : value;});
  const closeBody = source.match(/const closeMenus = \(\) => \{([\s\S]*?)\n  \};/)[1];
  const close = new Function(...names.map(name => `set${name}Open`), closeBody);
  const closeMenus = () => close(...setters);
  for (const name of names) {
    const expression = `closeMenus(); set${name}Open(!${name.toLowerCase()}Open);`;
    assert.ok(source.includes(expression), `${name} closes peers before toggling`);
    const toggle = new Function('closeMenus', `set${name}Open`, `${name.toLowerCase()}Open`, expression);
    toggle(closeMenus, setters[names.indexOf(name)], state[name]);
    assert.deepEqual(names.filter(key => state[key]), [name]);
    toggle(closeMenus, setters[names.indexOf(name)], state[name]);
    assert.ok(names.every(key => !state[key]), 'clicking again closes the menu');
    state[name] = true;
  }
  const reportBody = source.match(/const selectReport = \(category, event\) => \{([\s\S]*?)\n  \};/)[1];
  let destination;
  new Function('closeMenus', 'setReportsSelectionClosed', 'event', 'setActive', 'category', reportBody)(closeMenus, ()=>{}, {currentTarget:{blur(){}}}, value=>{destination=value;}, {id:'maintenance'});
  assert.ok(names.every(key => !state[key]));
  assert.deepEqual(destination, {page:'Reports',reportCategory:'maintenance'});
  assert.match(source, /document\.addEventListener\('pointerdown', outside\)/);
  assert.match(source, /event\.key === 'Escape'\) closeMenus\(\)/);
});
