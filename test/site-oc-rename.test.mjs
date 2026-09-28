import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {canonicalSiteName,recordBelongsToSite} from '../site-location.mjs';
import {REGION_DATA,displaySiteName,normalizeOperationalSiteFields,normalizeUserSiteFields,reportScopeIncludesSite,userSiteScope} from '../region-scope.mjs';
import {drilldownView} from '../src/dashboard-drilldown-model.mjs';

test('every renamed OC site preserves OB identity, scope, and legacy filter selection',()=>{
  for(const site of REGION_DATA.flatMap(({sites})=>sites)){
    const old=site.replace(/\bOC\b/g,'OB');
    assert.equal(displaySiteName(old),site);
    assert.equal(canonicalSiteName(old),canonicalSiteName(site));
    assert.ok(recordBelongsToSite({site:old},site));
    assert.ok(reportScopeIncludesSite(userSiteScope({site:old}),site));
    const rows=[{site:old,door:'A'},{site:'Unrelated Yard',door:'B'}];
    assert.deepEqual(drilldownView(rows,REGION_DATA,{site:old}).rows,[rows[0]]);
  }
  assert.notEqual(canonicalSiteName('Dudhichua OC'),canonicalSiteName('Dudhichua East OC'));
});

test('location-only rename preserves unrelated values and supports lists and custom sites',()=>{
  const before={site:'Majri OB',sites:['Sasti OB','Majri OC'],siteAccess:'Majri OB | Majri OC',region:'Custom OB',reason:'OB repair',door:'OB-001',passwordHash:'secret'};
  const after=normalizeOperationalSiteFields(before);
  assert.equal(after.site,'Majri OC');
  assert.deepEqual(after.sites,['Sasti OC','Majri OC']);
  assert.equal(after.siteAccess,'Majri OC');
  assert.equal(after.region,'Custom OC');
  for(const key of ['reason','door','passwordHash'])assert.equal(after[key],before[key]);
  assert.equal(before.site,'Majri OB');
  assert.equal(displaySiteName('Custom OB (2nd)'),'Custom OC (2nd)');
});

test('one-time rename migrates location fields without rewriting IDs, remarks or credentials',async()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const start=source.indexOf('    const {rows:ocSiteNames}');
  const code=source.slice(start,source.indexOf('    // Repair the legacy ETC',start));
  const user={login:'operator',site:'Majri OB',passwordHash:'unchanged',remarks:'OB note'};
  const writes=[];
  const client={async query(sql,args){
    if(sql.startsWith('SELECT value'))return {rows:[]};
    if(sql.startsWith('SELECT id,'))return {rows:[{id:7,master_name:'Users & employees',record_data:user}]};
    writes.push({sql,args});return {rows:[]};
  }};
  await runInNewContext(`(async()=>{${code}})()`,{client,normalizeUserSiteFields,normalizeOperationalSiteFields});
  assert.deepEqual(JSON.parse(writes[0].args[0]),{...user,site:'Majri OC'});
  assert.equal(writes.filter(({sql})=>sql.startsWith('UPDATE ')&&!sql.startsWith('UPDATE master_records')).length,4);
  assert.ok(writes.some(({sql})=>sql.includes("'\\mOB\\M'")),'SQL matches whole-word OB only');
  const rerun=[];
  await runInNewContext(`(async()=>{${code}})()`,{client:{async query(sql){rerun.push(sql);return {rows:[{value:'true'}]};}},normalizeUserSiteFields,normalizeOperationalSiteFields});
  assert.equal(rerun.length,1);
});
