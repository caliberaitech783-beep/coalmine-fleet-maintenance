import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
import {canEditBreakdownResponsibility} from '../breakdown-responsibility.mjs';

const compile=async(file,name)=>{
  const source=readFileSync(new URL(file,import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'').replace(/export default function/g,'function').replace(/export function/g,'function');
  return (await transformWithOxc(source,name+'.jsx',{jsx:{runtime:'classic'}})).code+`; return ${name};`;
};
const historyCode=await compile('../src/breakdown-responsibility-history.jsx','BreakdownResponsibilityHistory');
const choiceCode=await compile('../src/maintenance-oem-choice.jsx','MaintenanceOemChoice');
const editCode=await compile('../src/responsibility-request-edit-form.jsx','ResponsibilityRequestEditForm');
function nodes(tree,predicate){
  const out=[];
  const visit=n=>{if(Array.isArray(n))return n.forEach(visit);if(!React.isValidElement(n))return;if(predicate(n))out.push(n);visit(n.props.children);};visit(tree);return out;
}
const text=node=>Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):String(node??'');
function harness(code,props,response={ok:true,json:async()=>({...props.request,oemResponsibility:'OEM',oemResponsibilityHistory:[]})}){
  let cursor=0;const slots=[],calls=[];
  const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];};
  const component=new Function('React','useState','useEffect','useRef','canEditBreakdownResponsibility','fetch','FormData','MaintenanceOemChoice',code)(React,useState,()=>{},value=>useState(()=>({current:value}))[0],canEditBreakdownResponsibility,async(url,options)=>{calls.push({url,...options});return response;},class {constructor(target){this.target=target;}get(key){return this.target[key];}},()=>null);
  return {calls,render(){cursor=0;return component(props);}};
}
const request={ref:'REQ-1',acceptedAt:'2026-10-03',status:'Accepted',oemResponsibility:'NON OEM'};
const session={role:'super',token:'fixture',permissions:{adminLevel:'Manager',managerRoles:['Project Manager']}};
const props={request,session,Dialog:()=>null,formatDate:v=>v};
test('history renders old/new values, author and date directly with no editor for any role',()=>{
  for(const role of ['Project Manager','Maintenance Manager','MIS Manager']){
    const h=harness(historyCode,{...props,session:{...session,permissions:{adminLevel:'Manager',managerRoles:[role]}},request:{...request,oemResponsibilityHistory:[{from:'NON OEM',to:'OEM',changedBy:'Manager',changedAt:'03-10-26'}]}});
    const tree=h.render();
    assert.match(text(tree),/NON OEM → OEM · Manager · 03-10-26/);
    assert.equal(nodes(tree,n=>['form','select','button','input'].includes(n.type)).length,0);
    assert.equal(h.calls.length,0);
  }
});

test('saved responsibility is switchable only when edit form grants manager permission',()=>{
  for(const canEdit of [false,true]){
    const h=harness(choiceCode,{request,canEdit});
    const choices=()=>nodes(h.render(),n=>n.type==='input'&&n.props.type==='checkbox');
    assert.equal(choices()[0].props.disabled,!canEdit);
    if(canEdit){
      choices()[0].props.onChange();choices()[1].props.onChange();choices()[0].props.onChange();
      assert.equal(choices()[0].props.checked,true);
      assert.equal(choices()[1].props.checked,false);
      assert.equal(h.calls.length,0);
    }
  }
});

test('initial unsaved choice remains exclusive and switchable until form submission',()=>{
  const h=harness(choiceCode,{request:{...request,oemResponsibility:''}});
  const choices=()=>nodes(h.render(),n=>n.type==='input'&&n.props.type==='checkbox');
  choices()[0].props.onChange();assert.equal(choices()[1].props.disabled,false);
  choices()[1].props.onChange();assert.equal(choices()[0].props.checked,false);assert.equal(choices()[1].props.checked,true);
  assert.equal(nodes(h.render(),n=>n.props.name==='oemResponsibility')[0].props.value,'NON OEM');
});

test('Project Manager edit form cancels without saving and submits once with the original value',async()=>{
  const saves=[];let closed=0;
  const h=harness(editCode,{request,Dialog:()=>null,close:()=>closed++,onSave:async value=>saves.push(value)});
  nodes(h.render(),n=>n.type==='button'&&text(n)==='Cancel')[0].props.onClick();
  assert.equal(closed,1);assert.equal(saves.length,0);
  const submit=nodes(h.render(),n=>n.type==='form')[0].props.onSubmit;
  const event={preventDefault(){},currentTarget:{oemResponsibility:'OEM',responsibilityChangeReason:'  Warranty confirmed  '}};
  await Promise.all([submit(event),submit(event)]);
  assert.deepEqual(saves,[{ref:'REQ-1',oemResponsibility:'OEM',previousResponsibility:'NON OEM',responsibilityChangeReason:'Warranty confirmed'}]);
  assert.equal(nodes(h.render(),n=>n.type==='input'&&!n.props.readOnly).length,0);
});

test('Project Manager edit form displays save failure and remains open',async()=>{
  let closed=false;
  const h=harness(editCode,{request,Dialog:()=>null,close:()=>closed=true,onSave:async()=>{throw new Error('Refresh and review');}});
  await nodes(h.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){},currentTarget:{oemResponsibility:'OEM'}});
  assert.equal(text(nodes(h.render(),n=>n.props.role==='alert')[0]),'Refresh and review');
  assert.equal(closed,false);
});

test('reason field appears only for a manager changing a saved choice and retains the draft when switching',()=>{
  const h=harness(choiceCode,{request,canEdit:true});
  const choices=()=>nodes(h.render(),n=>n.type==='input'&&n.props.type==='checkbox');
  assert.equal(nodes(h.render(),n=>n.type==='textarea').length,0);
  choices()[0].props.onChange();
  let reason=nodes(h.render(),n=>n.type==='textarea')[0];
  assert.equal(reason.props.name,'responsibilityChangeReason');
  assert.equal(reason.props.maxLength,1000);
  reason.props.onChange({target:{value:'Warranty confirmed'}});
  choices()[1].props.onChange();
  assert.equal(nodes(h.render(),n=>n.type==='textarea').length,0);
  choices()[0].props.onChange();
  assert.equal(nodes(h.render(),n=>n.type==='textarea')[0].props.value,'Warranty confirmed');
  assert.equal(h.calls.length,0);
});

test('history displays reason and timestamp while older history without a reason still renders',()=>{
  const h=harness(historyCode,{...props,request:{...request,oemResponsibilityHistory:[
    {from:'OEM',to:'NON OEM',changedBy:'Manager',changedAt:'03-10-26 02:00 PM',reason:'Warranty expired'},
    {from:'NON OEM',to:'OEM',changedBy:'Manager',changedAt:'02-10-26 02:00 PM'}
  ]}});
  assert.match(text(h.render()),/03-10-26 02:00 PM\nReason: Warranty expired/);
  assert.match(text(h.render()),/02-10-26 02:00 PM/);
  assert.doesNotMatch(text(h.render()),/undefined/);
});
