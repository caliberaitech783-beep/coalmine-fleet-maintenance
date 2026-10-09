import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('populated Users & employees renders without an approval flag and C-Dir accepts it',async()=>{
  const start=source.indexOf('function MasterPage(');
  const end=source.indexOf('\nfunction ',start+1);
  const {code}=await transformWithOxc(source.slice(start,end),'master.jsx',{jsx:{runtime:'classic'}});
  const empty=()=>null;
  const bindings={React,useState:v=>[v,()=>{}],useEffect:()=>{},
    masterFields:{'Users & employees':[['employee','Employee','text']],'C-Dir Employee master':[['employee','Employee','text']]},
    userPrivilegeFields:[],userSubmenuFields:[],isCdirMaster:n=>n.startsWith('C-Dir'),
    matchesSmartSearch:()=>true,tableRowMatchesFilters:()=>true,useSortableRows:rows=>[rows,{},()=>{}],
    formatMasterFieldValue:(key,value)=>value,MasterActions:empty,Search:empty,TableParameterFilter:empty,
    ActionsTable:({children})=>React.createElement('table',null,children),FilterableHeader:()=>React.createElement('th',null,'Employee'),
    LockKeyhole:empty,Pencil:empty,Trash2:empty};
  const MasterPage=new Function(...Object.keys(bindings),code+';return MasterPage;')(...Object.values(bindings));
  const render=(name,extra={})=>renderToStaticMarkup(React.createElement(MasterPage,{name,records:[{id:1,employee:'TEST EMPLOYEE'}],...extra}));
  assert.match(render('Users & employees'),/Delete TEST EMPLOYEE/);
  assert.match(render('Users & employees'),/Change password/);
  assert.match(render('C-Dir Employee master',{deletionApprovalRequired:true}),/Request deletion of TEST EMPLOYEE/);
});
test('approval flag is scoped to MasterPage, not breakdown, equipment or role fields',()=>{
  for(const name of ['BreakdownTable','Equipment','UserTypeAccessFields']){
    const start=source.indexOf(`function ${name}(`),end=source.indexOf('\nfunction ',start+1);
    assert.doesNotMatch(source.slice(start,end),/deletionApprovalRequired/,name);
  }
});
