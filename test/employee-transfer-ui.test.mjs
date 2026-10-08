import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import DateInput from '../src/date-input.mjs';
import {formatDisplayDate,formatDisplayDateTime} from '../date-time-format.mjs';
import {CDIR_MASTER_FIELDS,CDIR_MASTERS} from '../cdir-masters.mjs';
import {employeeTransferAccess,employeeTransferVisible} from '../employee-transfer.mjs';

const source=readFileSync(new URL('../src/employee-transfer.jsx',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export default function','function').replaceAll('export function','function');
const {code}=await transformWithOxc(source,'employee-transfer.jsx',{jsx:{runtime:'classic'}});
test('rendered transfer form autopopulates details and passes each register/history to shared export controls',()=>{
 const record={id:1,transferNo:'ET-1',empId:'E001',name:'EMPLOYEE',source:'Majri OC',destination:'Jayant OC',status:'Awaiting source approval',effectiveDate:'2026-10-09',outgoing:true,incoming:false,canApprove:true,history:[{action:'Requested',by:'HR',at:'2026-10-08T10:00:00Z'}],before:{name:'EMPLOYEE',site:'Majri OC'},proposed:{name:'EMPLOYEE',site:'Jayant OC'},proposedContact:{contact:'9123456789'}};
 const slots=[{token:'fixture',loading:false,records:[record],sites:['Majri OC','Jayant OC'],capabilities:{canSubmit:true}},'All','',true,'E001',{empId:'E001',source:'Majri OC',fields:[{key:'name',label:'Employee name'},{key:'contact',label:'Contact'}]}, {name:'EMPLOYEE',contact:'9123456789'},false,'','',record];let cursor=0,sections=[];
 const bindings={React,useState:initial=>[slots[cursor++]??initial,()=>{}],useEffect:()=>{},ArrowRightLeft:()=>null,Search:()=>null,RefreshCw:()=>null,Send:()=>null,X:()=>null,DateInput,formatDisplayDate,formatDisplayDateTime,CDIR_MASTER_FIELDS,CDIR_MASTERS};
 const Component=new Function(...Object.keys(bindings),code+'; return EmployeeTransfer;')(...Object.values(bindings));
 const ReportSection=props=>{sections.push(props);return React.createElement('section',null,props.title,props.rows.length?props.columns.map(column=>React.createElement(React.Fragment,{key:column.key},column.render?.(props.rows[0]))):null);};
 const render=token=>{cursor=0;sections=[];return renderToStaticMarkup(React.createElement(Component,{token,ReportSection}));};
 const html=render('fixture');assert.match(html,/value="EMPLOYEE"/);assert.match(html,/value="9123456789"/);assert.match(html,/Where to transfer/);assert.match(html,/Approve outgoing/);assert.doesNotMatch(html,/Accept incoming/);assert.ok(sections[0].columns.some(column=>column.label==='Source approved at'));assert.equal(sections.length,3);assert.deepEqual(sections[2].rows,record.history);assert.equal(sections[1].rows.find(row=>row.field==='Site / office').after,'Jayant OC');
 slots[1]='Incoming';render('fixture');assert.equal(sections[0].rows.length,0);
 slots[3]=false;slots[10]=null;assert.match(render('another-session'),/Loading employee transfers/);assert.equal(sections.length,0);
});

test('employee notification target checks ownership and current PM scope before returning employee data',async()=>{
 const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');const route=server.slice(server.indexOf("app.get('/api/notifications/:id/target'"),server.indexOf("app.patch('/api/notifications/read'"));let handler;
 let owned=true;let user={managerSites:'Majri OC'};const employee={source:'Majri OC',destination:'Jayant OC',transferNo:'ET-1'};
 const pool={query:async(sql)=>sql.includes('FROM crm_notifications')?{rows:owned?[{reference:'ET-1'}]:[]}:{rows:[{id:1,record_data:employee}]}};
 new Function('app','requireSession','pool','currentUserRecord','employeeTransferAccess','employeeTransferVisible',route)({get:(path,...handlers)=>{handler=handlers.at(-1);}},()=>{},pool,async()=>user,employeeTransferAccess,employeeTransferVisible);
 const session={role:'super',login:'pm',permissions:{adminLevel:'Manager',managerRoles:['Project Manager']}};
 const response=()=>({statusCode:200,set(){},vary(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
 let res=response();await handler({params:{id:'1'},session},res,err=>{throw err;});assert.equal(res.body.kind,'employee-transfer');assert.equal(res.body.record.transferNo,'ET-1');
 user={managerSites:'Sasti OC'};res=response();await handler({params:{id:'1'},session},res,err=>{throw err;});assert.equal(res.statusCode,404);
 owned=false;user={managerSites:'Majri OC'};res=response();await handler({params:{id:'1'},session},res,err=>{throw err;});assert.equal(res.statusCode,404);
});
