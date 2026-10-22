import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerLoginHistoryRoutes} from '../user-login-history.mjs';

test('login activity projects saved user groups for active and never-recorded accounts without exposing master secrets', async () => {
  const cases=[
    [{userType:'Mobile User',userGroup:'HR Manager'},'HR Manager'],
    [{userType:'Mobile User',userGroup:'HR User'},'HR User'],
    [{userType:'Mobile User',userGroup:'Production User'},'Production User'],
    [{userType:'Mobile User',userGroup:'Maintenance User'},'Maintenance User'],
    [{userType:'Mobile User',userGroup:'MIS User'},'MIS User'],
    [{userType:'Mobile User',userRoles:'Production User | MIS User',assignedRole:'Maintenance User'},'Production User | MIS User'],
    [{userType:'Super Admin',adminLevel:'Manager',managerRole:'Maintenance Manager | Production Manager'},'Maintenance Manager | Production Manager'],
    [{userType:'Super User',adminLevel:'Manager',managerRole:'Project Manager'},'Project Manager'],
    [{userType:'Super Admin',adminLevel:'Manager',managerRole:'MIS Manager'},'MIS Manager'],
    [{userType:'Super Admin',adminLevel:'Admin',managerRole:'MIS Manager'},'Admin'],
    [{userType:'Super Admin',adminLevel:'Super Admin'},'Super Admin'],
    [{userType:'Mobile User',userRoles:[],userGroup:'MIS User'},'Not assigned'],
    [{userType:'HR Application User'},'HR Application User'],
    [{userType:'MIS Application User'},'MIS Application User'],
    [{userType:'Account User'},'Account User'],
  ];
  const records=cases.map(([record],id)=>({id,record:{...record,login:`USER${id}`,employee:'Same display name',site:'Site A',passwordHash:'private-secret'},
    lastLogin:id%2?'2026-10-01T00:00:00Z':null,lastActivity:id%2?'2026-10-02T00:00:00Z':null,loginCount:0,sessionCount:0,loginDays:0}));
  const before=JSON.stringify(records);
  let handler,response;
  registerLoginHistoryRoutes({get(_path,...handlers){handler=handlers.at(-1);}}, {
    pool:{async query(sql){return {rows:sql.includes('FROM master_records')?records:[]};}},
    requireSuper(){},requireAdministrator(){},locationName:record=>record.site,
  });
  await handler({query:{period:'all'}},{set(){},json(data){response=data;}},error=>{throw error;});
  assert.deepEqual(response.users.map(row=>row.roleLabel),cases.map(([,expected])=>expected));
  assert.equal(JSON.stringify(records),before,'projection must not mutate saved role/permission data');
  assert.ok(response.users.every(row=>row.location==='Site A'));
  assert.ok(!JSON.stringify(response).includes('private-secret'));
  for(let i=0;i<records.length;i++){
    assert.equal(response.users[i].lastLogin,records[i].lastLogin);
    assert.equal(response.users[i].lastActivity,records[i].lastActivity);
  }
});

test('report heading, search and shared exports use the projected User Group', () => {
  const source=readFileSync(new URL('../src/user-login-history.jsx',import.meta.url),'utf8');
  const panel=source.slice(source.indexOf('export function UserLoginActivity('));
  assert.match(panel,/<th>User Group<\/th>/);
  assert.doesNotMatch(panel,/<th>Role<\/th>/);
  assert.match(panel,/<td>\{row.roleLabel\}<\/td>/);
  assert.match(panel,/\[row.name,row.login,row.roleLabel,row.location\]/);
  assert.match(panel,/toolbarPortal exportTitle="User login activity"/);
});
