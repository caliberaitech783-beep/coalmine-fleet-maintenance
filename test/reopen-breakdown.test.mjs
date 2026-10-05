import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canReopenBreakdown,reopenBreakdownError} from '../reopen-breakdown.mjs';
const eligible={status:'Closed',closedAt:'2026-10-05 16:00:00',acceptedAt:'2026-10-05 14:00:00'};
test('reopening sits beside history and uses a spacious dedicated dialog',()=>{
  const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(ui,/Closed history<\/button>\{canReopenRequests&&<button[^>]*data-nav="reopen"/);
  assert.match(ui,/className="reopen-breakdown-modal"/);
  const css=readFileSync(new URL('../src/reopen-breakdown-form.css',import.meta.url),'utf8');
  assert.match(css,/min-height: 160px/);
});
test('Maintenance and Project Managers receive the narrow reopening permission',()=>{
  const manager={role:'super',permissions:{adminLevel:'Manager',managerRoles:['Maintenance Manager']}};
  assert.equal(canReopenBreakdown(manager),true);
  assert.equal(canReopenBreakdown({...manager,permissions:{...manager.permissions,managerRoles:['Project Manager']}}),true);
  for(const role of ['Production Manager','MIS Manager'])assert.equal(canReopenBreakdown({...manager,permissions:{...manager.permissions,managerRoles:[role]}}),false);
  assert.equal(canReopenBreakdown({...manager,role:'normal'}),false);
  assert.equal(canReopenBreakdown({...manager,permissions:{adminLevel:'Admin'}}),false);
});
test('closure correction requires a reason and rejects downstream or idle workflows',()=>{
  assert.equal(reopenBreakdownError(eligible,'Marked on road by mistake'), '');
  for(const changes of [{status:'Accepted'},{closedAt:null},{acceptedAt:null},{verifiedAt:'2026-10-05'},{firstTripDone:true},{firstTripAt:'2026-10-05'},{productionFirstTripAt:'2026-10-05'},{vehicleIdle:true},{idealRequestedAt:'2026-10-05'}])assert.ok(reopenBreakdownError({...eligible,...changes},'Mistake'));
  assert.ok(reopenBreakdownError(eligible,'   '));assert.ok(reopenBreakdownError(eligible,'x'.repeat(501)));
});
test('route locks vehicle and request, checks fresh role/site, rejects newer requests and records correction atomically',()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const route=source.slice(source.indexOf("app.patch('/api/requests/:reference/reopen-breakdown'"),source.indexOf('function registerBreakdownResponsibilityRoute'));
  for(const text of ['requireSession','currentDashboardAuthorization(req.session,client)','canReopenBreakdown(current.session)','userManagesSite(current.user,before.site)','createRequestWithVehicleLock(identity','FOR UPDATE','reopenBreakdownError(before,reason)','created_at >=','workflow_history=workflow_history','recordRequestTimeline','INSERT INTO audit_events','closed_at=NULL'])assert.ok(route.includes(text),text);
  assert.ok(!route.includes('DELETE FROM'));
});
