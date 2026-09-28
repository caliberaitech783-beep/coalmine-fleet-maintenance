import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REGION_DATA,displaySiteName,displaySiteSelection,normalizeOperationalSiteFields,normalizeUserSiteFields} from '../region-scope.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('every spelling of a site resolves to the single display name',()=>{
  assert.equal(displaySiteName('SASTI'),'Sasti OC');
  assert.equal(displaySiteName('sasti ob'),'Sasti OC');
  assert.equal(displaySiteName('SASTI II'),'Sasti OC');
  assert.equal(displaySiteName('Majri'),'Majri OC');
  assert.equal(displaySiteName('dhoptala ob 2nd'),'Dhoptala OC (2nd)');
  assert.equal(displaySiteName('Gouri Pouni'),'Gauri Pauni OC (2nd)');
  assert.equal(displaySiteName('Jayant OC 2nd'),'Jayant OC','merged site shows as Jayant OC everywhere');
  assert.equal(displaySiteName('  '),'');
  assert.equal(displaySiteName('Some New Site'),'Some New Site');
});

test('operational records normalize Sasti and Majri across stored site fields',()=>{
  assert.deepEqual(normalizeOperationalSiteFields({site:'SASTI',currentLocation:'Sasti II',source:'Majri II',destination:'Majri OC',door:'D1'}),{
    site:'Sasti OC',currentLocation:'Sasti OC',source:'Majri OC',destination:'Majri OC',door:'D1',
  });
});

test('manager site selections dedupe case variants and keep unknown sites',()=>{
  assert.deepEqual(displaySiteSelection('sasti ob | Sasti OC | majri ob'),['Sasti OC','Majri OC']);
  assert.deepEqual(displaySiteSelection(['lalpeth ob','Custom Yard']),['Lalpeth OC','Custom Yard']);
});

test('user records are normalised without losing any other field',()=>{
  const record={login:'x',site:'majri ob',location:'majri ob',managerSites:'sasti ob | Sasti OC',phone:'1'};
  assert.deepEqual(normalizeUserSiteFields(record),{login:'x',site:'Majri OC',location:'Majri OC',managerSites:'Sasti OC',phone:'1'});
  assert.deepEqual(normalizeUserSiteFields({login:'y',site:'',managerSites:''}),{login:'y',site:'',managerSites:''});
});

test('server normalises user site names on write and migrates stored users once',()=>{
  assert.match(server,/initializeUserCredentials\(normalizeUserSiteFields\(normalizeUserAccessLabels\(record\)\)\)/);
  assert.match(server,/storedRecord=\{\.\.\.normalizeUserSiteFields\(normalizeUserAccessLabels\(record\)\)/);
  assert.match(server,/key='user_site_names_normalized'/);
  assert.match(server,/master_name='Users & employees' FOR UPDATE/);
  assert.match(server,/operational_site_names_normalized_v2/);
  assert.match(server,/UPDATE maintenance_requests SET site='Majri OB'/);
  assert.match(server,/UPDATE crm_tickets SET site='Majri OB'/);
  assert.match(server,/key='sasti_site_name_normalized_v1'/);
  assert.match(server,/UPDATE maintenance_requests SET site='Sasti OB'/);
  assert.match(server,/UPDATE crm_tickets SET site='Sasti OB'/);
  assert.match(server,/const storedSite=displaySiteName\(site\)/);
  assert.match(server,/key='jayant_ob_sites_merged_v1'/,'stored Jayant OB 2nd data is merged once');
  assert.match(server,/for\(const table of \['maintenance_requests','crm_tickets','request_corrections'\]\)\r?\n\s+await client\.query\(`UPDATE \$\{table\} SET site='Jayant OB' WHERE/);
  assert.match(server,/for\(const key of \['sites','siteAccess'\]\)/,'region rows and hierarchy site ticks are rewritten too');
});

test('Jayant OC 2nd is merged into Jayant OC: NCL has three sites and every list dedupes the old name',()=>{
  assert.deepEqual(REGION_DATA.find((region)=>region.code==='NCL').sites,['Jayant OC','Dudhichua OC','Dudhichua East OC']);
  assert.deepEqual(displaySiteSelection('Jayant OC | Jayant OC 2nd | Dudhichua OC | Dudhichua East OC'),['Jayant OC','Dudhichua OC','Dudhichua East OC']);
  assert.deepEqual(normalizeOperationalSiteFields({site:'Jayant OC 2nd',currentLocation:'JAYANT 2ND'}),{site:'Jayant OC',currentLocation:'Jayant OC'});
  assert.deepEqual(normalizeUserSiteFields({site:'Jayant OC 2nd',managerSites:'Jayant OC | Jayant OC 2nd'}),{site:'Jayant OC',managerSites:'Jayant OC'});
  assert.match(ui,/const regionSites = \(record = \{\}\) => displaySiteSelection\(record\.sites\);/,'the Region master tabs dedupe stored site lists');
});

test('the user form shows the same display names for manager sites and team locations',()=>{
  assert.match(ui,/sitesForManagerRegions\(managerRegions\)\.map\(displaySiteName\)/);
  assert.match(ui,/record\.managerSites = displaySiteSelection\(record\.managerSites\)\.join\(" \| "\)/);
  assert.match(ui,/<UserSiteFields record=\{record\} siteOptions=\{siteOptions\}/);
  assert.match(ui,/record\.site = displaySiteSelection\(record\.site \|\| record\.location\)/);
  assert.match(ui,/records\.flatMap\(\(record\) => userSiteSelection\(record\)\)/);
});
