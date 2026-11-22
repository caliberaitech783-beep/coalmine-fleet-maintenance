import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pulseLeaveProfile} from '../pulse-application-identity.mjs';

test('an active Pulse user receives only the leave, OD and gate-pass HR scope',()=>{
  const profile=pulseLeaveProfile({id:42,record_data:{login:'operator.one',employee:'Operator One',passwordHash:'hash',userType:'Mobile User',userRoles:'Production User',site:'Jayant OC'}});
  assert.equal(profile.login,'operator.one');
  assert.equal(profile.permissions.application,'HR');
  assert.equal(profile.permissions.leaveOnly,true);
  assert.deepEqual(profile.permissions.hrDesktopAccess,['Leave / OD / Gatepass']);
  assert.deepEqual(profile.permissions.hrMobileAccess,['Leave / OD / Gatepass']);
  assert.equal(profile.permissions.site,'Jayant OC');
});

test('inactive and first-login Pulse accounts cannot receive a leave-only grant',()=>{
  const base={login:'operator.one',passwordHash:'hash'};
  for(const record_data of [{...base,active:false},{...base,status:'Inactive'},{...base,mustChangePassword:true},{...base,passwordHash:''}])
    assert.equal(pulseLeaveProfile({id:42,record_data}),null);
});

test('the Pulse HR menu can open the leave workspace for signed-in users',async()=>{
  const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(source,/const canOpenAdminPage = \(name\) => \{\s*if\(name==='Leave \/ OD \/ Gatepass'\)return true;/);
  assert.match(source,/renderedActive === "Leave \/ OD \/ Gatepass" \? \(\s*<HrLeaveWorkspace/);
  assert.match(source,/event\.data\?\.type==='caliber-hr:ready'[\s\S]*?send\(\)/);
});

test('the embedded HR workspace fills the available Pulse page',async()=>{
  const css=await readFile(new URL('../src/topbar.css',import.meta.url),'utf8');
  assert.match(css,/\.normal>main:has\(>\.hr-leave-workspace\)\{max-width:none;width:100%;padding:0\}/);
  assert.match(css,/\.hr-leave-workspace\{height:calc\(100vh - var\(--navigation-header-height,72px\)\);[^}]*border:0;border-radius:0/);
});
