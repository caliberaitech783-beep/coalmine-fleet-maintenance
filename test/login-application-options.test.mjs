import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('Fleet Operation is the default and portals have explicit selectors',()=>{
  assert.match(source,/\[accountsPortal,setAccountsPortal\]=useState\(false\)/);
  assert.match(source,/aria-pressed=\{!accountsPortal\} onClick=\{\(\)=>selectLoginPortal\(false\)\}/);
  assert.match(source,/aria-pressed=\{accountsPortal\} onClick=\{\(\)=>selectLoginPortal\(true\)\}/);
  assert.match(source,/<strong>Fleet Operation<\/strong>/);
  assert.match(source,/<strong>Accounts<\/strong>/);
});
test('Tender is coming soon without a destination and Accident link is preserved',()=>{
  assert.match(source,/className="login-tender-link" disabled title="Tender — coming soon"/);
  assert.match(source,/<strong>Tender<\/strong>Coming soon/);
  assert.match(source,/className="login-accident-link" href="https:\/\/bdms.cmll.in"/);
});
