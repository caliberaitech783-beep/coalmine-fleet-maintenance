import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const guide=readFileSync(new URL('../src/recovery-guide.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const topbar=readFileSync(new URL('../src/topbar.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('Recovery guide is an Administration page before Audit Trail, for Admin and Super Admin only',()=>{
  assert.match(main,/\["Recovery guide", LifeBuoy\],\n  \["Audit Trail", History\],\n\];/);
  assert.match(main,/"Recovery guide": "recovery"/);
  assert.match(main,/if\(name==="Recovery guide"\)return isAdministrator;/);
  assert.match(main,/active === "Recovery guide" \? \(\s*<RecoveryGuide onNavigate=\{selectMenu\} \/>/);
  assert.match(topbar,/\.workspace-menu-item\[data-workspace="recovery"\] \.workspace-icon \{ --ws-a: #fb923c; --ws-b: #dc2626;/);
});

test('the guide explains the four parts, three layers, the trial and each disaster case',()=>{
  for(const text of ['The database','The application code','The Azure settings','The Azure resources','Server backup every night','Copy to your PC every day','Azure PostgreSQL automatic backups','Practise a restore without changing anything','RESTORE BDMS','node scripts/restore-database.mjs --input'])
    assert.ok(guide.includes(text),text);
  assert.match(guide,/const open = \(page, label\) => <button type="button" className="recovery-link" onClick=\{go\(page\)\}>/,'links jump to the backup pages');
  for(const page of ['Backup Schedule','Backup','Import Backup','Audit Trail'])assert.ok(guide.includes(`open("${page}"`),page);
});
