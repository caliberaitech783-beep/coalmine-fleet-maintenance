import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {CDIR_MASTER_FIELDS} from '../cdir-masters.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';
import {cdirChangeVisible} from '../cdir-change-requests.mjs';

test('update review displays old/proposed values, scoped decision, reasons and exportable history without leaking another token state',async()=>{
 const source=readFileSync(new URL('../src/cdir-change-requests.jsx',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
 const {code}=await transformWithOxc(source,'cdir-change-requests.jsx',{jsx:{runtime:'classic'}});
 const row={id:1,requestNo:'CD-UPD-TEST',status:'Pending',site:'Majri OC',sites:['Majri OC'],requestedBy:'HR',requestedLogin:'hr',reason:'Correction',reviewSites:['Majri OC'],approvals:[{site:'Majri OC',status:'Pending'}],changes:[{master:'C-Dir Employee master',before:{name:'ORIGINAL'},after:{name:'PROPOSED'}}],history:[{action:'Submitted',by:'HR',login:'hr',note:'Correction'}]};
 const slots=[{token:'fixture',loading:false,records:[row]},row,'Majri OC','',false,'','','Pending',''];let cursor=0,sections=[];
 const bindings={React,CDIR_MASTER_FIELDS,formatDisplayDateTime,RefreshCw:()=>null,X:()=>null,useState:initial=>[slots[cursor++]??initial,()=>{}],useEffect:()=>{}};
 const Component=new Function(...Object.keys(bindings),code+';return CdirChangeRequests;')(...Object.values(bindings));
 const ReportSection=props=>{sections.push(props);return React.createElement('section',null,props.title);};
 const render=token=>{cursor=0;sections=[];return renderToStaticMarkup(React.createElement(Component,{token,ReportSection}));};
 const html=render('fixture');assert.match(html,/Approve proposed changes/);assert.match(html,/Reject/);assert.match(html,/Correction/);assert.equal(sections.length,3);assert.equal(sections[1].rows[0].before,'ORIGINAL');assert.equal(sections[1].rows[0].after,'PROPOSED');assert.deepEqual(sections[2].rows,row.history);
 row.reviewSites=[];assert.doesNotMatch(render('fixture'),/Approve proposed changes/);
 assert.match(render('other-token'),/Loading directory approvals/);assert.equal(sections.length,0);
});

test('directory update bell target checks notification ownership and current role/location',async()=>{
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');const route=source.slice(source.indexOf("app.get('/api/notifications/:id/target'"),source.indexOf("app.patch('/api/notifications/read'"));let handler,owned=true;
 let user={managerSites:'Majri OC'};const record={site:'Majri OC',sites:['Majri OC'],requestNo:'CD-UPD-1',requestedLogin:'hr'};
 const pool={query:async sql=>sql.includes('FROM crm_notifications')?{rows:owned?[{reference:'CD-UPD-1'}]:[]}:{rows:[{id:1,record_data:record}]}};
 new Function('app','requireSession','pool','currentUserRecord','cdirChangeVisible',route)({get:(path,...handlers)=>{handler=handlers.at(-1);}},()=>{},pool,async()=>user,cdirChangeVisible);
 const session={role:'super',login:'pm',permissions:{adminLevel:'Manager',managerRoles:['Project Manager']}};
 const response=()=>({statusCode:200,set(){},vary(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
 let res=response();await handler({params:{id:'1'},session},res,error=>{throw error;});assert.equal(res.body.kind,'cdir-update');
 user={managerSites:'Jayant OC'};res=response();await handler({params:{id:'1'},session},res,error=>{throw error;});assert.equal(res.statusCode,404);
 owned=false;user={managerSites:'Majri OC'};res=response();await handler({params:{id:'1'},session},res,error=>{throw error;});assert.equal(res.statusCode,404);
});
