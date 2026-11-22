import test from 'node:test';
import assert from 'node:assert/strict';
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
