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
function nodes(tree,predicate){
  const out=[];
  const visit=n=>{if(Array.isArray(n))return n.forEach(visit);if(!React.isValidElement(n))return;if(predicate(n))out.push(n);visit(n.props.children);};visit(tree);return out;
}
const text=node=>Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):String(node??'');
function harness(code,props,response={ok:true,json:async()=>({...props.request,oemResponsibility:'OEM',oemResponsibilityHistory:[]})}){
  let cursor=0;const slots=[],calls=[];
  const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];};
  const component=new Function('React','useState','useEffect','useRef','canEditBreakdownResponsibility','fetch',code)(React,useState,()=>{},value=>useState(()=>({current:value}))[0],canEditBreakdownResponsibility,async(url,options)=>{calls.push({url,...options});return response;});
  return {calls,render(){cursor=0;return component(props);}};
}
const request={ref:'REQ-1',acceptedAt:'2026-10-03',status:'Accepted',oemResponsibility:'NON OEM'};
const session={role:'super',token:'fixture',permissions:{adminLevel:'Manager',managerRoles:['Project Manager']}};
const props={request,session,Dialog:()=>null,formatDate:v=>v};
test('manager can switch repeatedly, cancel without a write, then explicitly save once',async()=>{
  const h=harness(historyCode,props);
  const button=(tree,label)=>nodes(tree,n=>n.type==='button'&&text(n).includes(label))[0];
  button(h.render(),'History').props.onClick();
  let select=()=>nodes(h.render(),n=>n.type==='select')[0];
  select().props.onChange({target:{value:'OEM'}});
  select().props.onChange({target:{value:'NON OEM'}});
  select().props.onChange({target:{value:'OEM'}});
  assert.equal(select().props.value,'OEM');assert.equal(h.calls.length,0);
  button(h.render(),'Cancel').props.onClick();
  assert.equal(nodes(h.render(),n=>n.type==='form').length,0);assert.equal(h.calls.length,0);
  button(h.render(),'History').props.onClick();assert.equal(select().props.value,'NON OEM');
  select().props.onChange({target:{value:'OEM'}});
  const submit=nodes(h.render(),n=>n.type==='form')[0].props.onSubmit;
  await Promise.all([submit({preventDefault(){}}),submit({preventDefault(){}})]);
  assert.equal(h.calls.length,1);
  assert.deepEqual(JSON.parse(h.calls[0].body),{oemResponsibility:'OEM',previousResponsibility:'NON OEM'});
});
test('failed save retains the draft and displays an error',async()=>{
  const h=harness(historyCode,props,{ok:false,json:async()=>({error:'Refresh and review'})});
  nodes(h.render(),n=>n.type==='button')[0].props.onClick();
  nodes(h.render(),n=>n.type==='select')[0].props.onChange({target:{value:'OEM'}});
  await nodes(h.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  assert.equal(nodes(h.render(),n=>n.type==='select')[0].props.value,'OEM');
  assert.equal(text(nodes(h.render(),n=>n.props.role==='alert')[0]),'Refresh and review');
});
test('non-managers and closed/verified/Idle requests have history but no editor',()=>{
  for(const override of [{session:{role:'normal'}},{request:{...request,status:'Closed'}},{request:{...request,status:'Idle'}},{request:{...request,verifiedAt:'2026-10-03'}}]){
    const h=harness(historyCode,{...props,...override});nodes(h.render(),n=>n.type==='button')[0].props.onClick();
    assert.equal(nodes(h.render(),n=>n.type==='select').length,0);
  }
});
test('initial unsaved choice remains exclusive and switchable until form submission',()=>{
  const h=harness(choiceCode,{request:{...request,oemResponsibility:''}});
  const choices=()=>nodes(h.render(),n=>n.type==='input'&&n.props.type==='checkbox');
  choices()[0].props.onChange();assert.equal(choices()[1].props.disabled,false);
  choices()[1].props.onChange();assert.equal(choices()[0].props.checked,false);assert.equal(choices()[1].props.checked,true);
  assert.equal(nodes(h.render(),n=>n.props.name==='oemResponsibility')[0].props.value,'NON OEM');
});
