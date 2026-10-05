import test from 'node:test';
import assert from 'node:assert/strict';
import {ADMIN_SUBMENU_OPTIONS} from '../admin-access.mjs';
import {userPermissionOptions,retainedHiddenPermissions} from '../src/user-permission-options.mjs';

test('user permission form excludes only the four requested report choices',()=>{
  const reports=ADMIN_SUBMENU_OPTIONS.Reports;
  assert.deepEqual(userPermissionOptions(reports),['Reports','General Report','Production report','Maintenance report','MIS Report','Vehicle History Report','Accounts']);
  assert.equal(reports.options.length,11,'global report availability is unchanged');
  for(const [tab,submenu] of Object.entries(ADMIN_SUBMENU_OPTIONS)){
    if(tab!=='Reports')assert.equal(userPermissionOptions(submenu),submenu.options);
  }
});

test('existing hidden permissions are retained without assigning new ones',()=>{
  const reports=ADMIN_SUBMENU_OPTIONS.Reports;
  assert.deepEqual(retainedHiddenPermissions(reports,['Reports','Purchase Order','GRN Register']),['Purchase Order','GRN Register']);
  assert.deepEqual(retainedHiddenPermissions(reports,['Reports']),[]);
  assert.deepEqual(retainedHiddenPermissions(reports,['unknown']),[]);
});
