import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../public/cd/caliber-directory.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .filter(match => !match[0].includes('type="application/json"')).map(match => match[1]);
const source = scripts[0];
const functions = new Map();
// Run the page's actual named helpers against synthetic data, without a browser or staff records.
for (const pattern of [/^  function (\w+)\([^\n]*?\{[^\n]*\}\r?$/gm,
  /^  function (\w+)\([^\n]*\{[ \t]*\r?\n[\s\S]*?^  \}/gm]) {
  for (const match of source.matchAll(pattern)) functions.set(match[1], match[0]);
}

function fixture() {
  const data = {
    meta: {}, sites: [{id:'mine',label:'Example Mine'}, {id:'office',label:'Example Office',flag:'not_in_roster'}],
    categories:['A','A1','A2','B','B1','B2','C','C1','C2'],
    matrix:{'mine|A':[
      {empId:'VACANT',_k:'id:VACANT',name:null,status:'VACANT'},
      {empId:'VACANT',_k:'id:VACANT',name:null,status:'VACANT'},
      {empId:'EMP1',name:'Example Employee',status:'ACTIVE',gender:'MALE',department:'HR'},
      {empId:'',name:'No ID',status:'ACTIVE'},
    ]}, siteTotals:{}, siteStats:{}, categoryTotalsUnique:{},
  };
  const context = vm.createContext({
    document:{getElementById:()=>({textContent:JSON.stringify(data)})},
    renderTopPills(){}, refreshAllRoster(){}, updateEditsNote(){},
  });
  const names = ['catIdx','catOrderCmp','editKey','findStoredPerson','findStoredBucket',
    'applyPatchToStore','recountDirectory','bumpCountsForAdd','addNewRecordToStore',
    'maskPhone','displayPhone','statusBadge'];
  const init = source.slice(source.indexOf('  const DATA ='), source.indexOf('  // ---------- contact-number'));
  vm.runInContext(init + '\nlet overrides = {}, editedKeys = new Set(), addedKeys = new Set(), addedDocIds = new Set(), redactPhones = true;\n' +
    names.map(name => {assert.ok(functions.has(name), name); return functions.get(name);}).join('\n') +
    '\nrecountDirectory(); globalThis.api = {DATA,' + names.join(',') + '};', context);
  return context.api;
}

test('C-dir dashboard scripts parse and keep the supplied feature controls', () => {
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script));
  for (const id of ['sidebarToggle','sidebarPin','navDockBar','gfSite','gfDept','gfDesig','gfName',
    'notifBellBtn','notesBellBtn','btnExportEdits','btnImportEdits']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
});

test('editing a repeated vacant position fills only that slot and updates counts', () => {
  const app = fixture();
  const [first, second] = app.DATA.matrix['mine|A'];
  assert.notEqual(app.editKey(first), app.editKey(second));
  const key = app.editKey(second);
  assert.equal(app.applyPatchToStore(key, {name:'New Employee',status:'ACTIVE',cat:'B'}), true);
  assert.equal(first.status, 'VACANT');
  assert.equal(app.DATA.matrix['mine|B'][0], second);
  assert.equal(app.findStoredPerson(key), second);
  assert.equal(app.DATA.meta.totalStaffSanctioned, 4);
  assert.equal(app.DATA.meta.totalFilled, 3);
  assert.equal(app.DATA.meta.totalVacant, 1);
  assert.equal(app.DATA.categoryTotalsUnique.A, 3);
  assert.equal(app.DATA.categoryTotalsUnique.B, 1);
  app.applyPatchToStore(key, {name:'New Employee',status:'ACTIVE',cat:'B'});
  assert.equal(app.DATA.categoryTotalsUnique.B, 1, 'repeated imports do not duplicate the slot');
});

test('records without employee IDs remain editable after name and category changes', () => {
  const app = fixture();
  const person = app.DATA.matrix['mine|A'][3];
  const key = app.editKey(person);
  app.applyPatchToStore(key, {name:'Updated Name',cat:'A2'});
  app.applyPatchToStore(key, {designation:'Updated Role'});
  assert.equal(app.findStoredPerson(key).designation, 'Updated Role');
  assert.equal(app.DATA.matrix['mine|A2'][0], person);
});

test('resigned records remain available while active, vacant and resigned totals reconcile', () => {
  const app = fixture();
  app.applyPatchToStore('id:EMP1', {status:'RESIGNED'});
  assert.equal(app.DATA.meta.totalFilled, 1);
  assert.equal(app.DATA.meta.totalVacant, 2);
  assert.equal(app.DATA.meta.totalResigned, 1);
  assert.match(app.statusBadge('RESIGNED'), /status-resigned/);
  app.applyPatchToStore('id:EMP1', {status:'ACTIVE'});
  assert.equal(app.DATA.meta.totalFilled, 2);
  assert.equal(app.DATA.meta.totalResigned, 0);
});

test('imported changes cannot replace record identity or use invalid categories/statuses', () => {
  const app = fixture();
  assert.equal(app.applyPatchToStore('id:EMP1', {cat:'unknown'}), false);
  assert.equal(app.applyPatchToStore('id:EMP1', {status:'unknown'}), false);
  app.applyPatchToStore('id:EMP1', {_k:'other',empId:'other',name:'Updated'});
  assert.equal(app.findStoredPerson('id:EMP1').empId, 'EMP1');
  assert.equal(app.findStoredPerson('id:EMP1').name, 'Updated');
});

test('adding to a previously empty site makes it available and prevents duplicate additions', () => {
  const app = fixture();
  const record = {empId:'NEW1',name:'Example New Employee',status:'ACTIVE',department:'IT'};
  assert.equal(app.addNewRecordToStore('office','B',record,'new-doc'), true);
  assert.equal(app.addNewRecordToStore('office','B',record,'new-doc'), false);
  assert.equal(app.DATA.sites[1].flag, null);
  assert.equal(app.DATA.siteStats.office.filled, 1);
  assert.equal(app.DATA.meta.totalSitesOffices, 2);
  assert.equal(app.addNewRecordToStore('missing','B',record,'other'), false);
});

test('category ordering precedes rank and privacy mode masks phone displays', () => {
  const app = fixture();
  const rows = [{cat:'B',rank:99},{cat:'A2',rank:99},{cat:'A',rank:1},{cat:'A1',rank:1}];
  rows.sort(app.catOrderCmp);
  assert.deepEqual(rows.map(row=>row.cat), ['A','A1','A2','B']);
  assert.equal(app.displayPhone('9999999999'), '99••••••99');
  assert.match(functions.get('renderPersonView'), /Call \$\{displayPhone\(p.contact\)\}/);
});

test('current-view CSV exports the selected rows and respects contact masking', () => {
  const rows = [{name:'Example Employee',status:'ACTIVE',contact:'9999999999',siteId:'mine'},
    {name:null,status:'VACANT',contact:'',siteId:'mine'}];
  let click, exported;
  let view = {type:'vacant'};
  const context = vm.createContext({
    document:{getElementById:()=>({addEventListener:(_event,handler)=>{click=handler;}})},
    current:()=>view, ALL_ROSTER:rows, sitesById:{mine:{label:'Example Mine'}},
    peopleForFilter:()=>[rows[0]], buildLeadershipRoster:()=>[rows[0]],
    download:(name,csv)=>{exported={name,csv};},
  });
  const start = source.indexOf("  document.getElementById('btnExportView').addEventListener");
  const end = source.indexOf('  // ---------- edit-data export', start);
  vm.runInContext('let redactPhones = true;\n' + ['maskPhone','displayPhone','csvEscape','exportCSV']
    .map(name=>functions.get(name)).join('\n') + source.slice(start,end), context);
  click();
  assert.equal(exported.csv.split('\n').length, 2);
  assert.match(exported.csv, /VACANT/);
  assert.doesNotMatch(exported.csv, /Example Employee/);
  view = {type:'siteDeptDesig',site:'mine',name:'Example'};
  click();
  assert.equal(exported.csv.split('\n').length, 2);
  assert.match(exported.csv, /99••••••99/);
  assert.doesNotMatch(exported.csv, /9999999999/);
});
