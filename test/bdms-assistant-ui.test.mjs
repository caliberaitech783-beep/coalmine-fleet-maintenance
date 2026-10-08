import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
import {bdmsChatCanRead,BDMS_WELCOME} from '../telegram-bdms-chatbot.mjs';
const source=readFileSync(new URL('../src/bdms-assistant.jsx',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
const {code}=await transformWithOxc(source,'assistant.jsx',{jsx:{runtime:'classic'}});
function harness(){
 let cursor=0;const slots=[],events=[];
 const scope={React,document:{body:{}},createPortal:x=>x,bdmsChatCanRead,BDMS_WELCOME,useId:()=> 'title',useEffect:()=>{},
  useState:initial=>{const i=cursor++;slots[i]??=initial;return [slots[i],v=>{slots[i]=v;}];},
  useRef:initial=>{const i=cursor++;slots[i]??={current:initial};return slots[i];},
  Audio:class{play(){events.push('play');return Promise.resolve();}pause(){events.push('pause');}},
  fetch:async(url,options)=>{events.push({url,options});return {ok:true,json:async()=>({language:'en',text:'Scoped results',keyboard:{keyboard:[['Open breakdowns']]},context:{}})};},
  ...Object.fromEntries(['MessageCircle','X','Volume2','Send'].map(n=>[n,()=>null]))};
 const Component=new Function(...Object.keys(scope),`${code};return BdmsAssistant;`)(...Object.values(scope));
 return {events,render:session=>{cursor=0;return Component({session,token:'session-fixture'});}};
}
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];
test('assistant opening starts greeting in the click handler; queries use authenticated session',async()=>{
 const h=harness(),session={role:'normal',assignedRole:'Production User',login:'prod'};
 const launch=nodes(h.render(session)).find(n=>n.type==='button');launch.props.onClick();
 assert.equal(h.events[0],'play');
 const english=nodes(h.render(session)).find(n=>n.type==='button'&&n.props.children==='English');await english.props.onClick();
 const sent=h.events.find(e=>e.url);
 assert.equal(sent.url,'/api/telegram/bdms-chatbot/preview');
 assert.equal(sent.options.headers.Authorization,'Bearer session-fixture');
 assert.deepEqual(JSON.parse(sent.options.body),{text:'English',language:'',context:{}});
 const close=nodes(h.render(session)).find(n=>n.props?.['aria-label']==='Close assistant');close.props.onClick();assert.equal(h.events.at(-1),'pause');
});
test('account and HR users cannot open BDMS assistant',()=>{
 for(const assignedRole of ['Account User','HR User'])assert.equal(harness().render({role:'normal',assignedRole,permissions:{readRequests:true}}),null);
});
