import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalSiteName} from '../site-location.mjs';
import {cdirApprovalRecipients} from '../cdir-approval-routing.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {employeeTransferAccess,employeeTransferSiteAllowed} from '../employee-transfer.mjs';

const westNames=['Dudhichua OC','Dudhichua West OC','Dudhichua West OB','Dudhicua West OC',' DUDHICHUA  WEST OC '];
const eastNames=['Dudhichua East OC','Dudhicua East OC'];

test('Dudhichua West aliases share an identity without merging East',()=>{
  for(const site of westNames) assert.equal(canonicalSiteName(site),'dudhichua ob');
  for(const site of eastNames) assert.equal(canonicalSiteName(site),'dudhichua east ob');
  assert.notEqual(canonicalSiteName(westNames[0]),canonicalSiteName(eastNames[0]));
});

test('transfer approval routing finds only the manager assigned to the matching site',()=>{
  const users=[
    {login:'west-pm',userType:'Super User',adminLevel:'Manager',managerRole:'Project Manager',managerSites:'Dudhichua OC'},
    {login:'east-pm',userType:'Super User',adminLevel:'Manager',managerRole:'Project Manager',managerSites:'Dudhichua East OC'},
  ];
  for(const site of westNames) assert.deepEqual(cdirApprovalRecipients(users,site,resolveMobileAccess),['west-pm']);
  for(const site of eastNames) assert.deepEqual(cdirApprovalRecipients(users,site,resolveMobileAccess),['east-pm']);
  const profile=resolveMobileAccess({user:users[0]});
  const access=employeeTransferAccess({role:profile.sessionRole,permissions:profile.permissions},users[0]);
  for(const site of westNames) assert.equal(employeeTransferSiteAllowed(access,site),true);
  for(const site of eastNames) assert.equal(employeeTransferSiteAllowed(access,site),false);
  assert.deepEqual(cdirApprovalRecipients([],westNames[0],resolveMobileAccess),[]);
});
