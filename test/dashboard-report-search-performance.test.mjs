import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchesSmartSearch} from '../smart-search.mjs';
import {createRowSearchIndex} from '../src/indexed-smart-search.mjs';

test('indexed report searches preserve existing matching for nested rows and query changes', () => {
  const rows = [
    {door:'PL-51',site:'Sasti OC',notes:[{reason:'Éngine repair',count:12}]},
    {door:'D42',site:'Majri OC',notes:['पुर्जे चाहिए']},
    {door:'V787',site:'Dudhichua East OC',status:null},
  ];
  const search = createRowSearchIndex();
  for (const query of ['', ' ', 'pl51', 'engine sasti', '12', 'पुर्जे', 'east v787', 'missing']) {
    assert.deepEqual(rows.filter(search(query)), rows.filter(row => matchesSmartSearch(query,row)), query);
  }
});

test('large collections are not indexed when search is empty and are read once across searches', () => {
  let reads = 0;
  const rows = Array.from({length:10000}, (_,i) => ({get door(){reads++;return `PL-${i}`;},site:'Sasti OC'}));
  const search = createRowSearchIndex();
  assert.equal(rows.filter(search('')).length,10000);
  assert.equal(reads,0);
  assert.equal(rows.filter(search('sasti')).length,10000);
  assert.equal(reads,10000);
  rows.filter(search('pl99'));
  rows.filter(search('missing'));
  assert.equal(reads,10000,'changing search text reuses normalized row text');
  const replacement = {door:'NEW-99',site:'Majri OC'};
  assert.equal(search('new99')(replacement),true,'replacement rows get fresh text');
});

test('shared dashboard filter choices scan only the open column', () => {
  const source=readFileSync(new URL('../src/shared-actions-table.jsx',import.meta.url),'utf8');
  const snippet=source.slice(source.indexOf('  const columnValues = useMemo('),source.indexOf('  // Rows are already filtered/sorted'));
  const choices=new Function('useMemo','openFilter','columns','dataRows',snippet+';return columnValues;');
  let reads=0;
  const columns=Array.from({length:50},(_,i)=>({key:`c${i}`,value:row=>{reads++;return row.value;}}));
  const rows=Array.from({length:10000},(_,i)=>({value:String(i%10)}));
  assert.deepEqual(choices(fn=>fn(),null,columns,rows),{});
  assert.equal(reads,0,'opening the table does not scan 500,000 cells for closed filters');
  const result=choices(fn=>fn(),'c2',columns,rows);
  assert.deepEqual(Object.keys(result),['c2']);
  assert.deepEqual(result.c2,['0','1','2','3','4','5','6','7','8','9']);
  assert.equal(reads,10000,'only the chosen column is enumerated');
});
