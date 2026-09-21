import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

test('master screens request only their required dataset and revalidate unchanged payloads', () => {
  const hook = main.slice(main.indexOf('function useMasterRecords('), main.indexOf('function MetaWhatsAppSetup('));
  const route = server.slice(server.indexOf("app.get('/api/masters',"), server.indexOf("app.post('/api/masters/", server.indexOf("app.get('/api/masters',")));
  assert.match(hook, /\/api\/masters\?names=\$\{encodeURIComponent\(name\)\}/);
  assert.match(hook, /"If-None-Match": responseEtag/);
  assert.match(hook, /response\.status === 304/);
  assert.match(route, /WHERE master_name = ANY\(\$1::text\[\]\)/);
  assert.match(route, /sendPrivateJson\(req,res,`masters:/);
});

test('large filter value lists are generated only for an open filter', () => {
  const filter = main.slice(main.indexOf('function TableParameterFilter('), main.indexOf('function exportCellText('));
  assert.match(filter, /useMemo\(\(\) => open \? Object\.fromEntries/);
  assert.match(main, /const activeFilterColumn = openFilter \?/);
  assert.doesNotMatch(main, /Object\.fromEntries\(filterColumns\.map/);
});
