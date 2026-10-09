import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {formatDisplayDateTime} from '../date-time-format.mjs';
import {employeeTransferAccess,employeeTransferSiteAllowed} from '../employee-transfer.mjs';

test('deletion register renders scoped decisions and exports snapshot/history through shared controls',async()=>{
 const source=readFileSync(new URL('../src/cdir-deletion.jsx',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
 const {code}=await transformWithOxc(source,'cdir-deletion.jsx',{jsx:{runtime:'classic'}});
 const row={id:1,requestNo:'CD-DEL-1',name:'EMPLOYEE',empId:'E001',site:'Corporate Office, Nagpur',status:'Pending',canApprove:true,reason:'Duplicate',record:{name:'EMPLOYEE',empId:'E001'},history:[{action:'Requested',by:'HR',at:'2026-10-09T10:00:00Z'}]};
 const slots=[{token:'fixture',loading:false,targets:[{id:2,master:'C-Dir Employee master',empId:'E001',name:'EMPLOYEE',site:row.site}],records:[row]},'Pending','','',true,false,'','',row,null];let cursor=0,sections=[];
 const bindings={React,useState:initial=>[slots[cursor++]??initial,()=>{}],useEffect:()=>{},Trash2:()=>null,RefreshCw:()=>null,X:()=>null,formatDisplayDateTime};
 const Component=new Function(...Object.keys(bindings),code+';return CdirDeletion;')(...Object.values(bindings));
 const ReportSection=props=>{sections.push(props);return React.createElement('section',null,props.title,props.columns.flatMap(column=>props.rows.map(row=>React.createElement(React.Fragment,{key:column.key+'-'+row.id},column.render?.(row)))));};
 const render=token=>{cursor=0;sections=[];return renderToStaticMarkup(React.createElement(Component,{token,ReportSection}));};
 let html=render('fixture');assert.match(html,/Approve deletion/);assert.match(html,/Reject/);assert.match(html,/Employee ID, name or location/);assert.match(html,/The record remains available until/);assert.equal(sections.length,3);assert.deepEqual(sections[2].rows,row.history);assert.ok(sections[0].columns.some(col=>col.key==='decisionNote'));
 row.canApprove=false;html=render('fixture');assert.doesNotMatch(html,/Approve deletion/);assert.match(html,/History/);
 assert.match(render('new-token'),/Loading deletion requests/);assert.equal(sections.length,0);
});

test('deletion notification targets require ownership and current role/site authorization',async()=>{
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');const route=source.slice(source.indexOf("app.get('/api/notifications/:id/target'"),source.indexOf("app.patch('/api/notifications/read'"));let handler,owned=true;
 let user={managerSites:'Majri OC'};const record={site:'Majri OC',requestNo:'CD-DEL-1',record:{name:'STAFF'}};
 const pool={query:async(sql)=>sql.includes('FROM crm_notifications')?{rows:owned?[{reference:'CD-DEL-1'}]:[]}:{rows:[{id:1,record_data:record}]}};
 new Function('app','requireSession','pool','currentUserRecord','employeeTransferAccess','employeeTransferSiteAllowed',route)({get:(path,...handlers)=>{handler=handlers.at(-1);}},()=>{},pool,async()=>user,employeeTransferAccess,employeeTransferSiteAllowed);
 const session={role:'super',login:'pm',permissions:{adminLevel:'Manager',managerRoles:['Project Manager']}};
 const response=()=>({statusCode:200,set(){},vary(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
 let res=response();await handler({params:{id:'1'},session},res,err=>{throw err;});assert.equal(res.body.kind,'cdir-deletion');
 user={managerSites:'Jayant OC'};res=response();await handler({params:{id:'1'},session},res,err=>{throw err;});assert.equal(res.statusCode,404);
 owned=false;user={managerSites:'Majri OC'};res=response();await handler({params:{id:'1'},session},res,err=>{throw err;});assert.equal(res.statusCode,404);
});
