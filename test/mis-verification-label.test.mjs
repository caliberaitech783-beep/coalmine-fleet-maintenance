import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MIS_VERIFICATION_MENU,normalizeRequestMenuLabel,normalizeUserAccessLabels,resolveMobileAccess} from '../mobile-access.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('the MIS request submenu no longer uses the label rejected by the production edge',()=>{
  assert.equal(MIS_VERIFICATION_MENU,'MIS verification');
  assert.equal(normalizeRequestMenuLabel('Verify closed requests'),'MIS verification');
  assert.equal(normalizeRequestMenuLabel('  verify closed requests '),'MIS verification');
  assert.equal(normalizeRequestMenuLabel('Closed history'),'Closed history');
  assert.ok(!ui.includes('"Verify closed requests"'),'the UI must not send the old label in any payload');
});

test('stored records with the old label keep their MIS verification access',()=>{
  const profile=resolveMobileAccess({user:{userType:'Mobile User',userGroup:'MIS User',desktopUserRequestAccess:'View requests | Verify closed requests | Closed history'}});
  assert.deepEqual(profile.permissions.desktopUserRequestAccess,['View requests','MIS verification','Closed history']);
  assert.deepEqual(profile.permissions.mobileUserRequestAccess,['View requests','MIS verification','Closed history']);
  const fallback=resolveMobileAccess({user:{userType:'Mobile User',userGroup:'MIS User'}});
  assert.deepEqual(fallback.permissions.desktopUserRequestAccess,['View requests','MIS verification','Closed history']);
});

test('user records are rewritten to the new label without touching other fields',()=>{
  const record={login:'mis',desktopUserRequestAccess:'View requests | Verify closed requests | Closed history',mobileUserRequestAccess:'Verify closed requests',site:'Majri OB'};
  assert.deepEqual(normalizeUserAccessLabels(record),{login:'mis',desktopUserRequestAccess:'View requests | MIS verification | Closed history',mobileUserRequestAccess:'MIS verification',site:'Majri OB'});
  assert.deepEqual(normalizeUserAccessLabels({login:'p',desktopUserRequestAccess:''}),{login:'p',desktopUserRequestAccess:''});
});

test('server normalises access labels on write and migrates stored users once',()=>{
  assert.match(server,/initializeUserCredentials\(normalizeUserSiteFields\(normalizeUserAccessLabels\(record\)\)\)/);
  assert.match(server,/storedRecord=\{\.\.\.normalizeUserSiteFields\(normalizeUserAccessLabels\(record\)\)/);
  assert.match(server,/key='user_access_labels_normalized'/);
});
