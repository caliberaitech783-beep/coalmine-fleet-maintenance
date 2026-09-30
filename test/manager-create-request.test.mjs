import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {navigationPermissionsForView, MANAGER_ROLE_OPTIONS} from '../admin-access.mjs';
import {readFileSync} from 'node:fs';

test('all manager profiles require an explicit desktop or mobile create privilege',()=>{
  for(const managerRole of MANAGER_ROLE_OPTIONS){
    const user={userType:'Super User',adminLevel:'Manager',managerRole};
    assert.equal(resolveMobileAccess({user}).permissions.createRequests,false);
    for(const [desktop,mobile] of [[true,false],[false,true],[true,true],[false,false]]){
      const permissions=resolveMobileAccess({user:{...user,desktopManagerCreateRequest:desktop,mobileManagerCreateRequest:mobile}}).permissions;
      assert.equal(permissions.createRequests,desktop||mobile);
      assert.equal(navigationPermissionsForView(permissions,false).desktopManagerCreateRequest,desktop);
      assert.equal(navigationPermissionsForView(permissions,true).desktopManagerCreateRequest,mobile);
    }
  }
  assert.equal(resolveMobileAccess({user:{userType:'Super User',adminLevel:'Admin'}}).permissions.createRequests,true);
});

test('manager creation enforces current permission and site scope before writing',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const route=server.slice(server.indexOf("app.post('/api/requests',"),server.indexOf("app.post('/api/requests',")+6000);
  assert.match(route,/requirePermission\('createRequests'\)/);
  assert.match(route,/resolveMobileAccess\(\{user:requester\}\)\.permissions\.createRequests/);
  assert.match(route,/userManagesSite\(requester,storedSite\)/);
  assert.ok(route.indexOf('userManagesSite(requester,storedSite)')<route.indexOf('INSERT INTO maintenance_requests'));
});
