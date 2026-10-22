import test from 'node:test';
import assert from 'node:assert/strict';
import {cdirApprovalRecipients,cdirLocationKey,cdirScopeIncludesSite} from '../cdir-approval-routing.mjs';
import {cdirSubmissionAllowed} from '../cdir-change-policy.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {employeeTransferAccess,employeeTransferSiteAllowed} from '../employee-transfer.mjs';
import {cdirViewerContext} from '../cdir-access.mjs';

test('live legacy directory labels resolve only to their own operational site approvers and HR assignments',()=>{
 for(const [roster,assigned]of [['Gauri Pauni OC','Gauri Pauni OC (2nd)'],['Hindustan Lalpeth OC','Lalpeth OC'],['Dhudhichua West OC','Dudhichua OC'],['Dudhicua East OC','Dudhichua East OC']]){
  assert.equal(cdirLocationKey(roster),cdirLocationKey(assigned));
  const user={login:'correct-pm',userType:'Super User',adminLevel:'Manager',managerRole:'Project Manager',managerSites:assigned};
  const wrong={...user,login:'wrong-pm',managerSites:'Majri OC'};
  assert.deepEqual(cdirApprovalRecipients([user,wrong],roster,resolveMobileAccess),['correct-pm']);
  const access=resolveMobileAccess({user}),session={role:access.sessionRole,permissions:access.permissions};
  assert.equal(employeeTransferSiteAllowed(employeeTransferAccess(session,user),roster),true);
  assert.equal(cdirSubmissionAllowed({assignedRole:'HR User'},{site:assigned},roster),true);
  assert.equal(cdirSubmissionAllowed({assignedRole:'HR User'},{site:'Majri OC'},roster),false);
  assert.deepEqual(cdirViewerContext({session:{assignedRole:'HR User'},user:{site:assigned},sites:[{id:'roster',label:roster}]}).siteIds,['roster']);
 }
 assert.equal(cdirScopeIncludesSite({sites:['Dudhichua East OC']},'Dhudhichua West OC'),false);
 assert.equal(cdirScopeIncludesSite({sites:[]},'Majri OC'),false);
});
