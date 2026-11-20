import test from 'node:test';
import assert from 'node:assert/strict';
import {hrTrialAccessError,normalizeHrTrialAssignments,prepareHrTrialAccess} from '../hr-trial-access.mjs';

const valid={hrAccess:true,hrDesktopAccess:'Employee Master',hrAccountStatus:'Active',hrTrialAssignments:JSON.stringify([{role:'Regional HR',sites:['Sasti OC']}])};

test('Trial roles are stored together with stable site identity and derived region',()=>{
  assert.deepEqual(normalizeHrTrialAssignments(valid.hrTrialAssignments),[{role:'Regional HR',allSites:false,sites:[{code:'SASTI-OC',name:'Sasti OC',region:'WCL'}]}]);
  assert.equal(hrTrialAccessError(valid),'');
});

test('Trial access requires HR, Employee Master, active status and explicit scope',()=>{
  assert.match(hrTrialAccessError({...valid,hrAccess:false}),/HR application access/);
  assert.match(hrTrialAccessError({...valid,hrDesktopAccess:'Dashboard'}),/Employee Master/);
  assert.match(hrTrialAccessError({...valid,hrAccountStatus:'Inactive'}),/inactive/);
  assert.match(hrTrialAccessError({...valid,hrTrialAssignments:'[{"role":"PM","sites":[]}]'}),/assigned site/);
});

test('only authorised central roles retain explicit all-sites access',()=>{
  assert.deepEqual(normalizeHrTrialAssignments([{role:'Director',allSites:true,sites:[]}]),[{role:'Director',allSites:true,sites:[]}]);
  assert.deepEqual(normalizeHrTrialAssignments([{role:'PM',allSites:true,sites:[]}]),[]);
  assert.deepEqual(prepareHrTrialAccess(valid).hrTrialAssignments,normalizeHrTrialAssignments(valid.hrTrialAssignments));
});
