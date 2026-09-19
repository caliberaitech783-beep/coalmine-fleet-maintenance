import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const topbar=readFileSync(new URL('../src/topbar.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('the header has a Backup menu whose sub-menu opens every backup page, for Admin and Super Admin only',()=>{
  const nav=main.match(/const backupNav = \[[\s\S]*?\];/)[0];
  assert.deepEqual([...nav.matchAll(/\["([^"]+)", [A-Za-z]+, "([a-z]+)"\]/g)].map(m=>[m[1],m[2]]),[['Backup','backup'],['Export Backup','export'],['Import Backup','import'],['Backup Schedule','schedule']]);
  const pages=main.match(/const backupAdminPages = new Set\(\[([^\]]+)\]\)/)[1];
  for(const [,page] of nav.matchAll(/\["([^"]+)",/g))assert.ok(pages.includes(`"${page}"`),`${page} opens the backup pages`);
  assert.match(main,/\{canViewAdmin && <div\s*className=\{`masters-menu backup-menu\$\{backupOpen \? " open" : ""\}/,'same visibility as the Admin menu');
  assert.match(main,/data-nav="backup" aria-haspopup="menu" aria-expanded=\{backupOpen\}/);
  assert.match(main,/<span className="nav-label">Backup<\/span><ChevronDown className="masters-chevron" \/>/);
  assert.match(main,/backupNav\.map\(\(\[name,Icon,menuKey\]\)=><div className="nav-config-row" key=\{name\}><button role="menuitem"[^\n]*data-workspace=\{menuKey\}[^\n]*selectDropdownPage\(name,event,setBackupSelectionClosed\)/);
  assert.match(main,/setAdminOpen\(false\);\n    setBackupOpen\(false\);/,'opening any page closes the Backup menu');
  assert.match(main,/const adminOnlyPages=new Set\(\[\.\.\.adminNav\.map\(\(\[name\]\)=>name\),\.\.\.backupNav\.map\(\(\[name\]\)=>name\),'Admin locks'\]\);/,'backup pages stay administrator-only');
  assert.match(topbar,/\.header-nav-item\[data-nav="backup"\] \{ --hn-a: #2dd4bf; --hn-b: #0f766e;/);
  assert.match(topbar,/\.backup-dropdown \{ min-width: 262px; padding: 8px; \}/);
});
