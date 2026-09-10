import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {canReadDashboardEquipment,currentDashboardUserCandidate,dashboardEquipmentScope,dashboardEquipmentScopeIsUsable,dashboardSessionFromProfile,scopeDashboardEquipmentRecords} from '../dashboard-equipment-access.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {recordsForSite} from '../site-location.mjs';

const equipment=[
  {id:1,equipmentName:'EX-1',currentLocation:'SASTI II'},
  {id:2,equipmentName:'EX-2',site:'Majri OB'},
  {id:3,equipmentName:'EX-3',location:'Jayant OB'},
  {id:4,equipmentName:'EX-4',currentLocation:''},
];

test('dashboard fleet reads are independent of Equipment Master CRUD access',()=>{
  const adminSession={
    role:'super',
    permissions:{adminLevel:'Admin',tabAccess:['Dashboard'],dashboardAccess:['Dashboard'],masterAccess:[]},
  };
  assert.equal(canReadDashboardEquipment(adminSession),true);
  assert.deepEqual(scopeDashboardEquipmentRecords(equipment,adminSession,{}),equipment);
});

test('only authenticated application roles with dashboard access may read dashboard equipment',()=>{
  assert.equal(canReadDashboardEquipment({role:'super',permissions:{adminLevel:'Manager'}}),true);
  assert.equal(canReadDashboardEquipment({role:'normal',assignedRole:'Maintenance User'}),true);
  assert.equal(canReadDashboardEquipment({role:'normal',assignedRole:'Unknown'}),false);
  assert.equal(canReadDashboardEquipment({role:'super',permissions:{adminLevel:'Admin',tabAccess:[],dashboardAccess:[]}}),false);
  assert.equal(canReadDashboardEquipment({}),false);
});

test('operational dashboard equipment is restricted to the user assigned site',()=>{
  const session={role:'normal',assignedRole:'MIS User'};
  assert.deepEqual(
    scopeDashboardEquipmentRecords(equipment,session,{site:'Sasti OB'}).map(({id})=>id),
    [1],
  );
  assert.deepEqual(scopeDashboardEquipmentRecords(equipment,session,{}),[]);
});

test('manager dashboard equipment follows the configured multi-site scope',()=>{
  const session={role:'super',permissions:{adminLevel:'Manager'}};
  assert.deepEqual(
    scopeDashboardEquipmentRecords(equipment,session,{managerSites:'Majri OB | Jayant OB'}).map(({id})=>id),
    [2,3],
  );
});

test('live profile authorization overrides a stale all-site session',()=>{
  const staleSession={role:'super',permissions:{adminLevel:'Admin',tabAccess:['Dashboard'],dashboardAccess:['Dashboard']}};
  const currentProfile=resolveMobileAccess({user:{userType:'Mobile User',userGroup:'MIS User'}});
  const currentSession=dashboardSessionFromProfile(currentProfile);
  assert.equal(canReadDashboardEquipment(staleSession),true);
  assert.equal(canReadDashboardEquipment(currentSession),true);
  assert.deepEqual(
    scopeDashboardEquipmentRecords(equipment,currentSession,{site:'Majri OB'}).map(({id})=>id),
    [2],
  );
  assert.deepEqual(dashboardEquipmentScope(currentSession,{site:'Majri OB'}),{
    restrictToScope:true,allowedSites:['majri ob'],allowedRegions:[],
  });
});

test('dashboard scope metadata describes manager and administrator visibility atomically',()=>{
  assert.deepEqual(
    dashboardEquipmentScope(
      {role:'super',permissions:{adminLevel:'Manager'}},
      {managerRegion:'WCL',managerSites:'Sasti OB | Majri OB'},
    ),
    {restrictToScope:true,allowedSites:['sasti ob','majri ob'],allowedRegions:['WCL']},
  );
  assert.deepEqual(
    dashboardEquipmentScope({role:'super',permissions:{adminLevel:'Admin'}},{}),
    {restrictToScope:false,allowedSites:null,allowedRegions:null},
  );
});

test('scoped API and dashboard use identical equipment location precedence',()=>{
  const records=[
    {id:1,currentLocation:'Majri OB',location:'Sasti OB',site:'Jayant OB'},
    {id:2,currentLocation:'',location:'Majri OB',site:'Sasti OB'},
    {id:3,currentLocation:' ',location:'Sasti OB',site:'Majri OB'},
    {id:4,currentLocation:'',location:'',site:'Majri O.B.'},
  ];
  const scoped=scopeDashboardEquipmentRecords(records,{role:'normal',assignedRole:'MIS User'},{site:'Majri OB'});
  assert.deepEqual(scoped.map(row=>row.id),[1,2,4]);
  assert.deepEqual(scoped,recordsForSite(records,'Majri OB'));
  assert.deepEqual(recordsForSite(scoped,'Majri OB'),scoped);
});

test('explicit manager sites determine region metadata without widening the permitted sites',()=>{
  const session={role:'super',permissions:{adminLevel:'Manager'}};
  const user={managerRegion:'NCL',managerSites:'Majri O.B.'};
  assert.deepEqual(dashboardEquipmentScope(session,user),{
    restrictToScope:true,allowedSites:['majri ob'],allowedRegions:['WCL'],
  });
  assert.deepEqual(scopeDashboardEquipmentRecords(equipment,session,user).map(row=>row.id),[2]);
  assert.deepEqual(dashboardEquipmentScope(session,{managerRegion:'WCL',managerSites:'Majri OB | Jayant OB'}),{
    restrictToScope:true,allowedSites:['majri ob','jayant ob'],allowedRegions:['WCL','NCL'],
  });
  assert.deepEqual(dashboardEquipmentScope(session,{managerRegion:'NCL',managerSites:'Unrecognised site'}),{
    restrictToScope:true,allowedSites:['unrecognised site'],allowedRegions:[],
  });
  assert.deepEqual(scopeDashboardEquipmentRecords(equipment,session,{managerRegion:'NCL',managerSites:'Unrecognised site'}),[]);
});

test('operational and manager assignment fallbacks accept currentLocation without expanding scope',()=>{
  const user={site:' ',location:'\t',currentLocation:'Majri II'};
  const operational={role:'normal',assignedRole:'Maintenance User'};
  assert.deepEqual(dashboardEquipmentScope(operational,user),{
    restrictToScope:true,allowedSites:['majri ob'],allowedRegions:[],
  });
  assert.deepEqual(scopeDashboardEquipmentRecords(equipment,operational,user).map(row=>row.id),[2]);
  assert.deepEqual(dashboardEquipmentScope({role:'super',permissions:{adminLevel:'Manager'}},user),{
    restrictToScope:true,allowedSites:['majri ob'],allowedRegions:['WCL'],
  });
});

test('unrestricted All region scope is not accidentally narrowed by additional region metadata',()=>{
  const session={role:'super',permissions:{adminLevel:'Manager'}};
  const user={managerRegion:'All | WCL'};
  assert.deepEqual(dashboardEquipmentScope(session,user),{
    restrictToScope:false,allowedSites:null,allowedRegions:[],
  });
  assert.deepEqual(scopeDashboardEquipmentRecords(equipment,session,user),equipment);
});

test('dashboard identity lookup never falls back to a same-name explicit account',()=>{
  const renamed={login:'new-login',employee:'Same Employee'};
  assert.equal(
    currentDashboardUserCandidate([{record_data:renamed}],{login:'old-login',name:'Same Employee'}),
    null,
  );
  assert.equal(
    currentDashboardUserCandidate([{record_data:renamed}],{login:'new-login',name:'Same Employee'}),
    renamed,
  );
  assert.equal(currentDashboardUserCandidate([
    {record_data:renamed},
    {record_data:{login:'new-login',employee:'Another Employee'}},
  ],{login:'new-login',name:'Same Employee'}),null);
});

test('legacy first-name and blank-session fallbacks require one unambiguous employee',()=>{
  const rahul={login:'',employee:'Rahul Kumar'};
  assert.equal(currentDashboardUserCandidate([{record_data:rahul}],{login:'rahul',name:'Rahul Kumar'}),rahul);
  assert.equal(currentDashboardUserCandidate([{record_data:rahul}],{login:'',name:'Rahul Kumar'}),rahul);
  assert.equal(currentDashboardUserCandidate([
    {record_data:rahul},
    {record_data:{login:'',employee:'Rahul Kumar'}},
  ],{login:'rahul',name:'Rahul Kumar'}),null);
});

test('empty operational and Manager scopes are configuration errors, not empty fleets',()=>{
  assert.equal(dashboardEquipmentScopeIsUsable(dashboardEquipmentScope({role:'normal',assignedRole:'MIS User'},{})),false);
  assert.equal(dashboardEquipmentScopeIsUsable(dashboardEquipmentScope({role:'super',permissions:{adminLevel:'Manager'}},{})),false);
  assert.equal(dashboardEquipmentScopeIsUsable(dashboardEquipmentScope({role:'super',permissions:{adminLevel:'Admin'}},{})),true);
});

test('dashboard equipment API is authenticated, uncached, scoped, and always returns a records array',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const start=server.indexOf("app.get('/api/dashboard/equipment'");
  const end=server.indexOf("app.get('/api/masters'",start);
  assert.ok(start>=0&&end>start,'dashboard equipment route should exist before the master API');
  const route=server.slice(start,end);
  assert.match(route,/private, no-store, no-cache, must-revalidate/);
  assert.match(route,/\.vary\('Authorization'\)/);
  assert.match(route,/requireSession/);
  assert.match(route,/currentDashboardAuthorization\(req\.session\)/);
  assert.match(route,/if\(!authorization\)[\s\S]*res\.status\(401\)/);
  assert.match(route,/canReadDashboardEquipment\(authorization\.session\)/);
  assert.match(route,/dashboardEquipmentScopeIsUsable\(scope\)/);
  assert.match(route,/res\.status\(409\)/);
  assert.match(route,/WHERE master_name='Equipment master'/);
  assert.match(route,/dashboardFleetSnapshot\(records,activeFleetRequests\)/);
  assert.match(route,/scopeDashboardEquipmentRecords\(fleetSnapshot,authorization\.session,authorization\.user,scope\)/);
  assert.match(route,/res\.json\(\{[\s\S]*records:/);
  assert.doesNotMatch(route,/masterAccess|mobileMasterAccess/);
});

test('dashboard equipment authorization is rebuilt from current user and privilege records',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const start=server.indexOf('async function currentDashboardAuthorization');
  const end=server.indexOf('function ticketProjection',start);
  assert.ok(start>=0&&end>start,'live dashboard authorization helper should exist');
  const helper=server.slice(start,end);
  assert.match(helper,/master_name='Users & employees'/);
  assert.match(helper,/master_name='Privilege'/);
  assert.match(helper,/currentDashboardUserCandidate\(userRows,session\)/);
  assert.match(helper,/resolveMobileAccess\(\{user,privilege:/);
  assert.match(helper,/dashboardSessionFromProfile\(profile\)/);
  assert.match(helper,/if\(!user\)return null/);
});
