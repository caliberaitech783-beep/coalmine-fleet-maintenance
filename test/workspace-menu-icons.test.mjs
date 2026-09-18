import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const styles=readFileSync(new URL('../src/topbar.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('each Operational Workspaces entry is a keyed menu item with an icon badge',()=>{
  assert.match(source,/operationalWorkspaceNav\.map\(\(\[name, Icon, role\]\) => <div className="nav-config-row" key=\{name\}><button role="menuitem" className=\{`workspace-menu-item\$\{active === name \? " active" : ""\}`\} data-workspace=\{String\(role\)\.split\(" "\)\[0\]\.toLowerCase\(\)\}/);
  assert.match(source,/<span className="workspace-icon" aria-hidden="true"><Icon \/><i className="workspace-icon-glow" \/><\/span><span className="nav-label">\{name\}<\/span>/);
  assert.match(source,/\["Production workspace", Truck, "Production User"\],\s*\["Maintenance workspace", Wrench, "Maintenance User"\],\s*\["MIS workspace", ShieldCheck, "MIS User"\]/,'the data-workspace keys are production, maintenance and mis');
});

test('the three icons get their own gradient badge and animation, with reduced motion respected',()=>{
  for(const key of ['production','maintenance','mis'])assert.match(styles,new RegExp(`\\.workspace-menu-item\\[data-workspace="${key}"\\] \\.workspace-icon \\{ --ws-a: #[0-9a-f]{6}; --ws-b: #[0-9a-f]{6};`),key);
  assert.match(styles,/\.workspace-icon \{[\s\S]*background: linear-gradient\(135deg, var\(--ws-a\), var\(--ws-b\)\)/);
  assert.match(styles,/\[data-workspace="production"\]:hover \.workspace-icon svg[\s\S]*animation: ws-drive/);
  assert.match(styles,/\[data-workspace="maintenance"\]:hover \.workspace-icon svg[\s\S]*animation: ws-wrench/);
  assert.match(styles,/\[data-workspace="mis"\]:hover \.workspace-icon svg[\s\S]*animation: ws-shield/);
  assert.match(styles,/\.workspace-menu-item\.active \.workspace-icon-glow \{ animation: ws-ring/,'the active workspace keeps its glow ring');
  for(const name of ['ws-drive','ws-wrench','ws-shield','ws-ring'])assert.match(styles,new RegExp(`@keyframes ${name} \\{`),name);
  assert.match(styles,/button\.workspace-menu-item::before \{[\s\S]*translateX\(-120%\)/,'hover sheen');
  assert.match(styles,/@media \(prefers-reduced-motion: reduce\) \{\s*\.workspace-menu-item,[\s\S]*animation: none !important/);
});

test('the WhatsApp Integration menu uses the same badge markup with its own colours and animations',()=>{
  assert.match(source,/const whatsappMenuKey = \(name\) => \(\{ "Meta API setup": "setup", "Daily site-wise report": "site", "Daily OEM report": "oem", "WhatsApp alert history": "history" \}\)\[name\] \|\| "whatsapp";/);
  assert.match(source,/visibleWhatsAppNav\.map\(\(\[name, Icon\]\) => \(\s*<div className="nav-config-row" key=\{name\}><button role="menuitem" className=\{`workspace-menu-item\$\{active === name \? " active" : ""\}`\} data-workspace=\{whatsappMenuKey\(name\)\}/);
  assert.match(source,/<span className="workspace-icon" aria-hidden="true"><Icon \/><i className="workspace-icon-glow" \/><\/span><span className="nav-label">\{navigationLabel\(name\)\}<\/span>/);
  for(const key of ['setup','site','oem','history'])assert.match(styles,new RegExp(`\\.workspace-menu-item\\[data-workspace="${key}"\\] \\.workspace-icon \\{ --ws-a: #[0-9a-f]{6}; --ws-b: #[0-9a-f]{6};`),key);
  assert.match(styles,/\[data-workspace="setup"\]:hover \.workspace-icon svg[\s\S]*animation: ws-spin/);
  assert.match(styles,/\[data-workspace="site"\]:hover \.workspace-icon svg[\s\S]*animation: ws-rise/);
  assert.match(styles,/\[data-workspace="oem"\]:hover \.workspace-icon svg[\s\S]*animation: ws-shield/);
  assert.match(styles,/\[data-workspace="history"\]:hover \.workspace-icon svg[\s\S]*animation: ws-rewind/);
  for(const name of ['ws-spin','ws-rise','ws-rewind'])assert.match(styles,new RegExp(`@keyframes ${name} \\{`),name);
  assert.match(styles,/\.app > aside nav \.masters-dropdown button\.workspace-menu-item \{/,'the item styling is shared by every dropdown that uses the markup');
  assert.match(styles,/\.operational-workspaces-dropdown,\s*\.whatsapp-dropdown \{ min-width: 252px; padding: 8px; \}/);
});
