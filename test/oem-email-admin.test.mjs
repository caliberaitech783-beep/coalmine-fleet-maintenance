import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerOemEmailAdmin} from '../oem-email-admin.mjs';
import {safeOemRetry,safeOemError} from '../oem-email-delivery-state.mjs';
import {oemEmailRecipients} from '../oem-breakdown-email.mjs';

function harness({row,locked=true,data={contacts:[],requests:[],equipment:[]}}={}){
  const routes={},queries=[],messages=[];
  const superGuard=()=>{},adminGuard=()=>{};
  const client={release(){},async query(sql,args){
    queries.push({sql,args});
    if(sql.includes('pg_try'))return {rows:[{locked}]};
    if(sql.startsWith('SELECT * FROM'))return {rows:row?[row]:[]};
    if(sql.includes('RETURNING day')){row.status='Sending';row.retry_safe=false;return {rowCount:1,rows:[{day:'2026-10-06'}]};}
    if(sql.includes('to_regclass'))return {rows:[{name:null}]};
    return {rows:[],rowCount:1};
  }};
  const config={user:'sender@example.com'};
  const transporter={verify:async()=>{},sendMail:async message=>{messages.push(message);return {accepted:[message.to],messageId:'accepted-id'};}};
  registerOemEmailAdmin({get(path,...handlers){routes[`GET ${path}`]=handlers;},post(path,...handlers){routes[`POST ${path}`]=handlers;}},
    {pool:{connect:async()=>client,query:client.query},requireSuper:superGuard,requireAdministrator:adminGuard,scheduledJobsEnabled:true,
      mailerFactory:()=>({config,transporter}),loadData:async()=>data});
  const response={code:200,set(){},status(code){this.code=code;return this;},json(body){this.body=body;}};
  const call=async(path,body={})=>{await routes[path].at(-1)({body,session:{login:'admin'}},response,error=>{throw error;});return response;};
  return {routes,queries,messages,superGuard,adminGuard,call,transporter};
}
test('every delivery read, SMTP check and retry route requires both server admin guards',()=>{
  const h=harness();assert.equal(Object.keys(h.routes).length,3);
  for(const handlers of Object.values(h.routes)){assert.equal(handlers[0],h.superGuard);assert.equal(handlers[1],h.adminGuard);}
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.ok(source.includes('if(name==="OEM Email Delivery Status")return isAdministrator;'));
  assert.ok(source.includes('canViewAdmin||name==="User Sessions"'));
});
test('missing delivery table is reported honestly, without inventing successful sends',async()=>{
  const h=harness(),res=await h.call('GET /api/oem-email-deliveries');
  assert.deepEqual(res.body.deliveries,[]);assert.equal(res.body.configured,true);assert.equal(h.messages.length,0);
});
test('connection check sends no messages and surfaces authentication errors',async()=>{
  const h=harness();await h.call('POST /api/oem-email-deliveries/check');assert.equal(h.messages.length,0);
  h.transporter.verify=async()=>{throw new Error('Invalid login: password=secret');};
  const res=await h.call('POST /api/oem-email-deliveries/check');assert.equal(res.code,502);assert.doesNotMatch(res.body.error,/secret/);
});
test('only definite pre-delivery failures qualify for retry',()=>{
  assert.equal(safeOemRetry({code:'EAUTH'},true),true);
  assert.equal(safeOemRetry({code:'EDNS'},true),true);
  assert.equal(safeOemRetry({code:'ETIMEDOUT'},true),false);
  assert.equal(safeOemRetry({},true),false);
  assert.equal(safeOemRetry({},false),true);
  assert.doesNotMatch(safeOemError(new Error('AUTH PLAIN secret')),/secret/);
});
test('retry rejects accepted, ambiguous, missing, in-progress and concurrently locked attempts',async()=>{
  const body={day:'2026-10-06',recipientKey:'abc',reason:'Credentials repaired'};
  for(const row of [undefined,{status:'SMTP accepted',retry_safe:true},{status:'Sending',retry_safe:true},{status:'Failed / review required',retry_safe:false},{status:'Failed / review required',retry_safe:true,message_id:'accepted'}]){
    const h=harness({row}),res=await h.call('POST /api/oem-email-deliveries/retry',body);assert.equal(res.code,409);assert.equal(h.messages.length,0);
  }
  const h=harness({locked:false});assert.equal((await h.call('POST /api/oem-email-deliveries/retry',body)).code,409);assert.equal(h.messages.length,0);
});
test('retry requires a reason and rejects changed contacts before sending',async()=>{
  const h=harness({row:{status:'Failed / review required',retry_safe:true}});
  assert.equal((await h.call('POST /api/oem-email-deliveries/retry',{})).code,400);
  assert.equal((await h.call('POST /api/oem-email-deliveries/retry',{day:'2026-10-06',recipientKey:'abc',reason:'Fixed'})).code,409);
  assert.equal(h.messages.length,0);
});
test('retry rebuilds only matching active cases, attaches both files, records actor and blocks a second send',async()=>{
  const contact={oem:'Scania',email:'oem@example.com',level:'L1',location:'Sasti OC'};
  const recipient=oemEmailRecipients([contact])[0];
  const data={contacts:[contact],equipment:[{door:'D1',make:'Scania',currentLocation:'Sasti OC'}],requests:[{ref:'OPEN',door:'D1',site:'Sasti OC',status:'Accepted',oemResponsibility:'OEM'}]};
  const row={status:'Failed / review required',retry_safe:true,email:contact.email};
  const h=harness({row,data}),body={day:'2026-10-06',recipientKey:recipient.recipientKey,reason:'SMTP credentials repaired'};
  assert.equal((await h.call('POST /api/oem-email-deliveries/retry',body)).code,200);
  assert.equal(h.messages.length,1);assert.equal(h.messages[0].attachments.length,2);assert.equal(h.messages[0].to,contact.email);
  const audit=h.queries.find(query=>query.sql.includes('RETURNING day'));assert.match(audit.args[2],/SMTP credentials repaired/);assert.match(audit.args[2],/admin/);
  assert.equal((await h.call('POST /api/oem-email-deliveries/retry',body)).code,409);assert.equal(h.messages.length,1);
  const empty=harness({row:{...row,status:'Failed / review required',retry_safe:true},data:{...data,requests:[]}});
  assert.equal((await empty.call('POST /api/oem-email-deliveries/retry',body)).code,409);assert.equal(empty.messages.length,0);
});
