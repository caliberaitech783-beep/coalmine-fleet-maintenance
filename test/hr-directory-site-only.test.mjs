import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHrDirectory,hrOfficeSite} from '../hr-directory-bridge.mjs';

/* Owner, 22 Nov 2026: HR logins posted at OB / COAL sites never receive Corporate / Head Office staff. */
const sites=[{id:'ho',label:'Head Office, Chandrapur',group:'OFFICE'},{id:'co',label:'Corporate Office, Nagpur',group:'OFFICE'},{id:'majri',label:'Majri OB',group:'WCL'},{id:'sasti',label:'Sasti OB',group:'WCL'}];
const person=(name,cat='B')=>({name,cat,empId:name,status:'ACTIVE'});
const directory={sites,matrix:{'ho|A':[person('Ho Head','A')],'co|B':[person('Co Clerk')],'majri|B':[person('Majri Clerk')],'sasti|B':[person('Sasti Clerk')]}};
const pool={async query(){return {rows:[]};}};
const load=viewer=>loadHrDirectory({pool,profile:{permissions:{hrDesktopAccess:['Employee Master']}},user:{},masterNames:[],buildDirectory:()=>directory,mergeSuperiors:d=>d,viewerContext:()=>viewer,forViewer:d=>d});

test('recognises the office labels',()=>{
  assert.equal(hrOfficeSite('Head Office, Chandrapur'),true);
  assert.equal(hrOfficeSite('Corporate Office, Nagpur'),true);
  assert.equal(hrOfficeSite('Chandrapur HO'),true);
  assert.equal(hrOfficeSite('Majri OB'),false);
  assert.equal(hrOfficeSite('Dudhichua OB East'),false);
});

test('a site HR login gets no office sites or office staff',async()=>{
  const result=await load({profile:'site-user',siteIds:['majri']});
  assert.deepEqual(result.sites.map(site=>site.id),['majri','sasti']);
  assert.deepEqual(result.rows.map(row=>row.name).sort(),['Majri Clerk','Sasti Clerk']);
});

test('admins, office logins and logins without sites keep the offices',async()=>{
  for(const viewer of [{profile:'admin-user',siteIds:['majri']},{profile:'site-user',siteIds:['ho']},{profile:'site-user',siteIds:['majri','co']},{profile:'general-user',siteIds:[]}]){
    const result=await load(viewer);
    assert.equal(result.sites.length,4,JSON.stringify(viewer));
    assert.equal(result.rows.length,4,JSON.stringify(viewer));
  }
});
