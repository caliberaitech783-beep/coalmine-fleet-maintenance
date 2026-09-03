import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displaySiteName,displaySiteSelection,normalizeUserSiteFields} from '../region-scope.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('every spelling of a site resolves to the single display name',()=>{
  assert.equal(displaySiteName('sasti ob'),'Sasti OB');
  assert.equal(displaySiteName('SASTI II'),'Sasti OB');
  assert.equal(displaySiteName('dhoptala ob 2nd'),'Dhoptala OB (2nd)');
  assert.equal(displaySiteName('Gouri Pouni'),'Gauri Pauni OB (2nd)');
  assert.equal(displaySiteName('Jayant OB 2nd'),'Jayant OB 2nd');
  assert.equal(displaySiteName('  '),'');
  assert.equal(displaySiteName('Some New Site'),'Some New Site');
});

test('manager site selections dedupe case variants and keep unknown sites',()=>{
  assert.deepEqual(displaySiteSelection('sasti ob | Sasti OB | majri ob'),['Sasti OB','Majri OB']);
  assert.deepEqual(displaySiteSelection(['lalpeth ob','Custom Yard']),['Lalpeth OB','Custom Yard']);
});

test('user records are normalised without losing any other field',()=>{
  const record={login:'x',site:'majri ob',location:'majri ob',managerSites:'sasti ob | Sasti OB',phone:'1'};
  assert.deepEqual(normalizeUserSiteFields(record),{login:'x',site:'Majri OB',location:'Majri OB',managerSites:'Sasti OB',phone:'1'});
  assert.deepEqual(normalizeUserSiteFields({login:'y',site:'',managerSites:''}),{login:'y',site:'',managerSites:''});
});

test('server normalises user site names on write and migrates stored users once',()=>{
  assert.match(server,/initializeUserCredentials\(normalizeUserSiteFields\(record\)\)/);
  assert.match(server,/storedRecord=\{\.\.\.normalizeUserSiteFields\(record\)/);
  assert.match(server,/key='user_site_names_normalized'/);
  assert.match(server,/master_name='Users & employees' FOR UPDATE/);
});

test('the user form shows the same display names for manager sites and team locations',()=>{
  assert.match(ui,/sitesForManagerRegions\(managerRegions\)\.map\(displaySiteName\)/);
  assert.match(ui,/record\.managerSites = displaySiteSelection\(record\.managerSites\)\.join\(" \| "\)/);
  assert.match(ui,/defaultValue=\{displaySiteName\(record\.site \|\| record\.location\)\}/);
  assert.match(ui,/record\.site = displaySiteName\(record\.site \|\| record\.location\)/);
  assert.match(ui,/records\.map\(\(record\) => displaySiteName\(record\.site\)\)/);
});
