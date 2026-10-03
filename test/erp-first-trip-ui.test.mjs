import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {readFileSync} from 'node:fs';import {transformWithOxc} from 'vite';
const source=readFileSync(new URL('../src/erp-first-trip-verification.jsx',import.meta.url),'utf8').replace(/^\uFEFF?import.*\r?\n/,'').replace('export function','function');
const code=(await transformWithOxc(source,'erp.jsx',{jsx:{runtime:'classic'}})).code;
const all=(node,p)=>Array.isArray(node)?node.flatMap(x=>all(x,p)):React.isValidElement(node)?[...(p(node)?[node]:[]),...all(node.props.children,p)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):React.isValidElement(n)?text(n.props.children):typeof n==='string'?n:'';
function harness(){let cursor=0,slots=[],effects=[],replies=[],interval;const useState=x=>{let i=cursor++;if(!(i in slots))slots[i]=typeof x==='function'?x():x;return [slots[i],v=>{slots[i]=v;}];};const scope={React,useState,useRef:x=>useState(()=>({current:x}))[0],useEffect:fn=>{cursor++;if(!effects.length)effects.push(fn);},AbortController,setInterval:fn=>{interval=fn;return 1;},clearInterval(){},FormData:class{constructor(v){this.v=v;}get(k){return this.v[k]||'';}},fetch:async()=>replies.shift()};const Component=new Function(...Object.keys(scope),code+';return ErpFirstTripVerification;')(...Object.values(scope));let props;return {replies,render(p=props){props=p;cursor=0;return Component(p);},start(){return effects[0]();},tick:()=>interval(),};}
const ready={status:'ready',sourceHash:'abc',image:'data:image/png;base64,abc',record:{documentNo:'V1',shift:'A',logDate:'2026-10-02',closingReadings:{KMR:'105',HMR:'20'}}};
const reply=body=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>body});
const settle=()=>new Promise(r=>setImmediate(r));
const props={request:{ref:'R1',door:'D1',site:'S1',meterType:'KMR'},Modal:'dialog',DateInput:'date-field',TwelveHourTimeInput:'time-field',token:'test',close(){},onSave(){}};
const button=(t,label)=>all(t,n=>n.type==='button'&&text(n)===label)[0];const submit=t=>all(t,n=>n.type==='form')[0].props.onSubmit({preventDefault(){},currentTarget:{firstTripDate:'2026-10-02',firstTripTime:'11:00:00'}});
test('automatic evidence fetch, required editable time, review, immutable readings and duplicate save guard',async()=>{
 const app=harness();let saved,finish,count=0,closed=0;let t=app.render({...props,close(){closed++;},onSave(p){saved=p;count++;return new Promise(r=>finish=r);}});app.replies.push(reply(ready));const cleanup=app.start();await settle();t=app.render();
 assert.equal(button(t,'Verify request').props.disabled,true);assert.equal(all(t,n=>n.props.name==='firstTripTime')[0].props.required,true);
 all(t,n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}});t=app.render();const pending=submit(t);await submit(t);assert.equal(count,1);assert.equal(saved.erpReviewed,true);assert.equal(saved.erpSourceHash,'abc');assert.equal(saved.closingMeterReading,'105');assert.equal(saved.firstTripTime,'11:00:00');
 t=app.render();t.props.close();button(t,'Cancel').props.onClick();assert.equal(closed,0);finish();await pending;cleanup();
});
test('pending and HTML failure block verification; refreshed evidence clears prior review',async()=>{
 const app=harness();app.render(props);app.replies.push(reply({status:'pending',message:'Awaiting completed shift'}));const cleanup=app.start();await settle();assert.equal(button(app.render(),'Verify request').props.disabled,true);
 app.replies.push({headers:{get:()=> 'text/html'}});await button(app.render(),'Recheck ERP log book').props.onClick();assert.match(text(app.render()),/did not return data/);
 app.replies.push(reply(ready));await button(app.render(),'Recheck ERP log book').props.onClick();all(app.render(),n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
 app.replies.push(reply(ready));await app.tick();assert.equal(button(app.render(),'Verify request').props.disabled,true);cleanup();
});
