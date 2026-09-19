import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as scope from '../region-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';
import {managerRoleSelection} from '../admin-access.mjs';
import {managerUserRole} from '../ticket-workflow.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const evaluate=(source,deps)=>new Function(...Object.keys(deps),source)(...Object.values(deps));
// A Maintenance Manager whose own record lists only managed sites files tickets under "Not assigned".
const manager={login:'suraj',employee:'Suraj Kumar Sharma',managerSites:'Majri OB'};
const managerSession={role:'super',login:'suraj',name:'Suraj Kumar Sharma',permissions:{adminLevel:'Manager',managerRoles:['Maintenance Manager']}};
const tickets=[
  {reference:'TIC/NOT-ASSIGNED/190926/000099',creatorLogin:'suraj',creatorRole:'Maintenance User',category:'Maintenance',site:'Not assigned'},
  {reference:'TIC/MAJRI-OB/210826/000003',creatorLogin:'sanskar',creatorRole:'Maintenance User',category:'Maintenance',site:'Majri OB'},
  {reference:'TIC/SASTI-OB/190926/000100',creatorLogin:'amit',creatorRole:'Maintenance User',category:'Maintenance',site:'Sasti OB'},
  {reference:'TIC/NOT-ASSIGNED/190926/000101',creatorLogin:'ravi',creatorRole:'Maintenance User',category:'Maintenance',site:'Not assigned'},
];
const references=(body)=>body.map((ticket)=>ticket.reference);

async function listTickets(session,{query={},record=manager}={}){
  let handler,sql='',values=[];
  const result={status:200};
  const start=server.indexOf("app.get('/api/tickets',");
  assert.ok(start>=0);
  evaluate(server.slice(start,server.indexOf('\napp.',start+1)),{
    ...scope,canonicalSiteName,managerRoleSelection,managerUserRole,TICKET_CATEGORIES:['Maintenance'],ticketProjection:()=>'*',
    app:{get:(_path,...handlers)=>{handler=handlers.at(-1);}},requireSession(){},currentUserRecord:async()=>record,
    pool:{query:async(text,params)=>{
      if(!/FROM crm_tickets/.test(text))return {rows:[]};
      sql=text;values=params;return {rows:tickets};
    }},
  });
  await handler({session,query},{set(){},status(code){result.status=code;return this;},json(body){result.body=body;}},(error)=>{throw error;});
  return {...result,sql,values};
}

test('a manager lists the tickets they raised, including ones filed under Not assigned', async()=>{
  const own=await listTickets(managerSession);
  assert.deepEqual(references(own.body),['TIC/NOT-ASSIGNED/190926/000099','TIC/MAJRI-OB/210826/000003']);
  assert.match(own.sql,/WHERE \(creator_role=ANY\(\$1::text\[\]\) OR \(\$2 <> '' AND lower\(creator_login\)=\$2\)\) ORDER BY/);
  assert.deepEqual(own.values,[['Maintenance User'],'suraj']);
  const category=await listTickets(managerSession,{query:{category:'Maintenance'}});
  assert.match(category.sql,/OR \(\$2 <> '' AND lower\(creator_login\)=\$2\)\) AND category=\$3 ORDER BY/);
  assert.deepEqual(category.values,[['Maintenance User'],'suraj','Maintenance']);
});

test('other managers, Admins and team users keep their existing ticket lists', async()=>{
  // Another Majri OB manager still sees only site tickets, not a colleague's unassigned ones.
  const colleague=await listTickets({...managerSession,login:'chitranjan'},{record:{login:'chitranjan',managerSites:'Majri OB'}});
  assert.deepEqual(references(colleague.body),['TIC/MAJRI-OB/210826/000003']);
  const admin=await listTickets({role:'super',login:'admin',permissions:{adminLevel:'Admin'}});
  assert.deepEqual(references(admin.body),references(tickets));
  assert.doesNotMatch(admin.sql,/WHERE/);
  const team=await listTickets({role:'normal',login:'suraj'},{record:{login:'suraj',site:'Majri OB'}});
  assert.match(team.sql,/WHERE lower\(creator_login\)=\$1 ORDER BY/);
  assert.deepEqual(team.values,['suraj']);
  assert.deepEqual(references(team.body),['TIC/MAJRI-OB/210826/000003']);
});

test('ticket audio, attachments and notification links open a manager\'s own unassigned tickets', async()=>{
  const start=server.indexOf('const userManagesSite='),end=server.indexOf('async function sendWhatsAppNotifications');
  const visible=evaluate(`${server.slice(start,end)};return ticketVisibleToSession;`,{
    ...scope,managerRoleSelection,managerUserRole,
    currentUserRecord:async(session)=>session.login==='suraj'?manager:{login:session.login,managerSites:'Majri OB'},
  });
  assert.equal(await visible(tickets[0],managerSession),true);
  assert.equal(await visible(tickets[1],managerSession),true);
  assert.equal(await visible(tickets[2],managerSession),false);
  assert.equal(await visible(tickets[3],managerSession),false);
  assert.equal(await visible(tickets[0],{...managerSession,login:'chitranjan'}),false);
  assert.equal(await visible({...tickets[3],creatorLogin:''},{...managerSession,login:''}),false);
  assert.equal(await visible(tickets[0],{role:'normal',login:'suraj'}),true);
  assert.equal(await visible(tickets[0],{role:'normal',login:'ravi'}),false);
  assert.equal(await visible(tickets[2],{role:'super',login:'admin',permissions:{adminLevel:'Admin'}}),true);
});
