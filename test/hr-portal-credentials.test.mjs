import test from 'node:test';import assert from 'node:assert/strict';
import {prepareHrCredentials} from '../hr-credentials.mjs';import {pulseApplicationProfile} from '../pulse-application-identity.mjs';
test('HR access uses the primary Pulse credential and selected menus',()=>{
 const user=prepareHrCredentials({login:'person',passwordHash:'primary-hash',hrAccess:true,hrLogin:'old',hrPassword:'old',hrPasswordHash:'old',hrDesktopAccess:['Dashboard','unknown']});
 assert.equal(user.passwordHash,'primary-hash');assert.equal(user.hrLogin,undefined);assert.equal(user.hrPasswordHash,undefined);assert.equal(user.hrPassword,undefined);
 assert.deepEqual(pulseApplicationProfile({record_data:user},'HR').permissions.hrDesktopAccess,['Dashboard']);
 assert.equal(pulseApplicationProfile({record_data:{...user,active:false}},'HR'),null);
});
