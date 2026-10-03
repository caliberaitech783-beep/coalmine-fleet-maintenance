import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ibossAccountsEligible,ibossAccountsAllowed} from '../iboss-access.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
const session=user=>{const p=resolveMobileAccess({user:{userType:'Super User',...user}});return {role:p.sessionRole,permissions:p.permissions};};
test('IBOSS admits explicit administrators, directors and Accounts staff',()=>{
 for(const user of [{adminLevel:'Admin'},{adminLevel:'Super Admin'},{adminLevel:'Manager',designation:'Director'},{adminLevel:'Manager',department:'Accounts'},{adminLevel:'Manager',designation:'Senior Accountant'},{adminLevel:'Manager',department:'Finance & Accounts'}])assert.equal(ibossAccountsAllowed(session(user)),true,JSON.stringify(user));
});
test('broad Reports and legacy default Admin do not grant IBOSS',()=>{
 for(const user of [{},{adminLevel:'Manager',managerRole:'Project Manager'},{adminLevel:'Manager',department:'Production'},{adminLevel:'Manager',designation:'MIS Manager'},{adminLevel:'Manager',employee:'Director Accounts',login:'accounts'}])assert.equal(ibossAccountsAllowed(session({...user,reportAccess:'Reports | Accounts'})),false,JSON.stringify(user));
 assert.equal(ibossAccountsEligible({}),false);
 assert.equal(ibossAccountsAllowed({role:'super',permissions:{adminLevel:'Admin'}}),false);
 assert.equal(ibossAccountsAllowed({role:'normal',permissions:{ibossAccounts:true}}),false);
});
test('explicit menu restrictions still apply and responsive view cannot bypass authority',()=>{
 assert.equal(ibossAccountsAllowed(session({adminLevel:'Admin',tabAccess:[]})),false);
 assert.equal(ibossAccountsAllowed(session({adminLevel:'Admin',reportAccess:[]})),false);
 assert.equal(ibossAccountsAllowed(session({adminLevel:'Admin'}),{ibossAccounts:false}),false);
});
test('all Accounts endpoints and navigation share the eligibility gate',()=>{
 const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const section=server.slice(server.indexOf("app.get('/api/reports/iboss-accounts/:view'"),server.indexOf("app.get('/api/reports/po-grn-reconciliation'"));
 assert.equal((section.match(/if\(!await accountsMergeAllowed\(req\)\)/g)||[]).length,5);
 assert.match(section,/currentUserRecord\(req.session\)/);
 assert.match(section,/resolveMobileAccess\(\{user\}\)/);
 const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.match(main,/filter\(\(\)=>ibossAccountsAllowed\(session,viewPermissions\)\)/);
 assert.match(main,/\["Accounts","Accounts Masters","Accounts Transactions"\].includes\(name\)\) return ibossAccountsAllowed/);
});
