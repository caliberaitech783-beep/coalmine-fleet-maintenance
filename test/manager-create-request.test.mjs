import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {navigationPermissionsForView, MANAGER_ROLE_OPTIONS} from '../admin-access.mjs';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
import {recordsForSite} from '../site-location.mjs';

test('manager form forwards Jayant and multi-site assignments to the existing equipment filter',async()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('function ManagerCreateRequestForm('),source.indexOf('function ManagerDashboard('));
  const {code}=await transformWithOxc(body,'ManagerCreateRequestForm.jsx',{jsx:{runtime:'classic'}});
  const Form=new Function('React','useMasterRecords','MaintenanceForm',`${code}; return ManagerCreateRequestForm;`)(React,()=>[[],null,true],()=>null);
  const equipmentRecords=[{door:'J1',currentLocation:'Jayant OC'},{door:'S1',currentLocation:'Sasti OC'}];
  for(const [assignedLocation,doors] of [['Jayant OB',['J1']],['Jayant OC | Sasti OC',['J1','S1']],['',[]]]){
    const form=Form({assignedLocation,equipmentRecords,equipmentLoaded:true,requests:[],onCreate:async()=>{},close:()=>{}});
    assert.equal(form.props.assignedLocation,assignedLocation);
    assert.deepEqual(recordsForSite(form.props.equipmentRecords,form.props.assignedLocation).map(row=>row.door),doors);
  }
});

test('Maintenance Managers can create in both views; other manager profiles retain explicit grants',()=>{
  for(const managerRole of MANAGER_ROLE_OPTIONS){
    const user={userType:'Super User',adminLevel:'Manager',managerRole};
    const maintenance=managerRole==='Maintenance Manager';
    assert.equal(resolveMobileAccess({user}).permissions.createRequests,maintenance);
    for(const [desktop,mobile] of [[true,false],[false,true],[true,true],[false,false]]){
      const permissions=resolveMobileAccess({user:{...user,desktopManagerCreateRequest:desktop,mobileManagerCreateRequest:mobile}}).permissions;
      assert.equal(permissions.createRequests,maintenance||desktop||mobile);
      assert.equal(navigationPermissionsForView(permissions,false).desktopManagerCreateRequest,maintenance||desktop);
      assert.equal(navigationPermissionsForView(permissions,true).desktopManagerCreateRequest,maintenance||mobile);
    }
  }
  assert.equal(resolveMobileAccess({user:{userType:'Super User',adminLevel:'Admin'}}).permissions.createRequests,true);
});

test('Maintenance Manager access also works in a secondary assigned manager profile',()=>{
  for(const managerRole of [['Project Manager','Maintenance Manager'],'MIS Manager | Maintenance Manager']){
    const permissions=resolveMobileAccess({user:{userType:'Super User',adminLevel:'Manager',managerRole}}).permissions;
    assert.equal(permissions.createRequests,true);
    assert.equal(navigationPermissionsForView(permissions,false).desktopManagerCreateRequest,true);
    assert.equal(navigationPermissionsForView(permissions,true).desktopManagerCreateRequest,true);
  }
});

test('manager creation enforces current permission and site scope before writing',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const route=server.slice(server.indexOf("app.post('/api/requests',"),server.indexOf("app.post('/api/requests',")+6000);
  assert.match(route,/requirePermission\('createRequests'\)/);
  assert.match(route,/resolveMobileAccess\(\{user:requester\}\)\.permissions\.createRequests/);
  assert.match(route,/userManagesSite\(requester,storedSite\)/);
  assert.ok(route.indexOf('userManagesSite(requester,storedSite)')<route.indexOf('INSERT INTO maintenance_requests'));
});
