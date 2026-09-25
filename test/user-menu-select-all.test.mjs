import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const style=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('user menu editor offers select-all controls for every menu and submenu group',()=>{
  const adminStart=ui.indexOf('function UserViewMenuFields(');
  const adminEnd=ui.indexOf('\nfunction OperationalViewMenuFields(',adminStart);
  const adminEditor=ui.slice(adminStart,adminEnd);
  const operationalEnd=ui.indexOf('\nfunction UserTypeAccessFields(',adminEnd);
  const operationalEditor=ui.slice(adminEnd,operationalEnd);

  assert.match(ui,/function AccessSelectAll\(\{label,options=\[\],selected=\[\],onChange\}\)/);
  assert.match(ui,/control\.current\.indeterminate=selectedCount>0&&!allSelected/,'partially selected groups show an indeterminate select-all control');
  assert.match(adminEditor,/label="Select all menus" options=\{ADMIN_TAB_OPTIONS\}/);
  assert.match(adminEditor,/label="Select all submenus" options=\{submenu\.options\}/);
  assert.match(adminEditor,/checked=\{selected\.includes\(option\)\} onChange=\{\(event\)=>toggleSubmenu/,'admin submenu options are controlled so select all changes submitted values');
  assert.match(operationalEditor,/label="Select all menus" options=\{menuOptions\}/);
  assert.match(operationalEditor,/label="Select all submenus" options=\{requestOptions\}/);
  assert.match(operationalEditor,/checked=\{selectedRequests\.includes\(option\)\} onChange=\{\(event\)=>toggleRequest/,'team-user submenus are controlled too');
  assert.match(style,/label\.access-select-all\{grid-column:1\/-1/);
});
