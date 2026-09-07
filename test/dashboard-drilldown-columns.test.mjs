import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('dashboard graph lists omit equipment name and make while retaining the other columns',()=>{
  const source=readFileSync(new URL('../src/dashboard-record-browser.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/<th>Equipment name<\/th>|<th>Make<\/th>/);
  assert.doesNotMatch(source,/<td>\{record.make/);
  for(const label of ['Machine / Door no.','Equipment category','Equipment group','Model','Serial / chassis no.']) assert.ok(source.includes(`<th>${label}</th>`));
  assert.match(source,/columnCount = 6 \+ \(requestRecords \? 4 : 0\) \+ \(lifecycleRecords \? 2 : 0\)/);
  assert.match(source,/<ActionsTable key=\{tableKey\} exportTitle=/);
});
