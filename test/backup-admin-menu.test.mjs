import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const topbar=readFileSync(new URL('../src/topbar.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('every backup page opens from the Administration menu, for Admin and Super Admin only',()=>{
  const nav=main.match(/const adminNav = \[[\s\S]*?\];/)[0];
  const entries=[...nav.matchAll(/\["([^"]+)", [A-Za-z0-9]+\]/g)].map(m=>m[1]);
  assert.deepEqual(entries,['User Sessions','Access structure','Reporting structure','Print helper','Request corrections','Recovery guide','Backup','Export Backup','Import Backup','Backup Schedule','Audit Trail']);

  const pages=main.match(/const backupAdminPages = new Set\(\[([^\]]+)\]\)/)[1];
  for(const page of ['Backup','Export Backup','Import Backup','Backup Schedule']){
    assert.ok(entries.includes(page),`${page} is listed in the Administration menu`);
    assert.ok(pages.includes(`"${page}"`),`${page} still opens the backup pages`);
  }

  // Each entry keeps the badge colour and animation it had in the old menu.
  const keys=main.match(/const adminMenuKeys = \{[\s\S]*?\};/)[0];
  for(const [page,key] of [['Backup','backup'],['Export Backup','export'],['Import Backup','import'],['Backup Schedule','schedule']]){
    assert.match(keys,new RegExp(`"${page}": "${key}"`),`${page} keeps its badge`);
    assert.match(topbar,new RegExp(`\\.workspace-menu-item\\[data-workspace="${key}"\\] \\.workspace-icon \\{`));
  }

  assert.match(main,/const adminOnlyPages=new Set\(\[\.\.\.adminNav\.map\(\(\[name\]\)=>name\),'Admin locks'\]\);/,'backup pages stay administrator-only');
});

test('the longer Administration menu still fits on screen',()=>{
  assert.match(topbar,/\.admin-dropdown \{\s*max-height: min\(70vh, 560px\);\s*overflow-y: auto;/);
});

test('the separate header Backup menu is gone',()=>{
  for(const gone of ['backupNav','backupOpen','backupSelectionClosed','backup-menu','backup-dropdown','DatabaseBackup']){
    assert.doesNotMatch(main,new RegExp(gone.replace(/[-]/g,'\\-')),`${gone} should not remain`);
  }
  assert.doesNotMatch(topbar,/data-nav="backup"/);
  assert.doesNotMatch(topbar,/\.backup-dropdown/);
});
