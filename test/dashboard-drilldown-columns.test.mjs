import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('dashboard graph lists add make only to breakdown reports and retain the other columns',()=>{
  const source=readFileSync(new URL('../src/dashboard-record-browser.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/<th>Equipment name<\/th>/);
  assert.match(source,/\{bdBalanceColumns && <th>Make<\/th>\}<th>Model<\/th>/);
  assert.match(source,/\{bdBalanceColumns && <td>\{record.make \|\| "—"\}<\/td>\}<td>\{record.model \|\| "—"\}<\/td>/);
  for(const label of ['Door No','Equipment category','Equipment group','Model','Serial / chassis no.']) assert.ok(source.includes(`<th>${label}</th>`));
  assert.match(source,/<ActionsTable key=\{tableKey\} toolbarTarget=\{toolbarTarget\} toolbarPortal exportTitle=/);
});
