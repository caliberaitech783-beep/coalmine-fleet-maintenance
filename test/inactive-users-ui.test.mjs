import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {readFileSync} from 'node:fs';import {transformWithOxc} from 'vite';
const source=readFileSync(new URL('../src/inactive-users.jsx',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
const {code}=await transformWithOxc(source,'inactive-users.jsx',{jsx:{runtime:'classic'}});
function view(open=false){const row={id:1,name:'Person <One>',login:'person',roleLabel:'Production User',location:'Site A',accountStatus:'Enabled'};let n=0;const updates=[];const values=['2026-10-22','2026-10-22',{from:'2026-10-22',to:'2026-10-22'},0,{loading:false,data:{users:[row],inactiveUsers:1,loggedInUsers:4,totalUsers:5,completeFrom:'2026-10-22'},error:''},open,null];const useState=()=>{const index=n++;return [values[index],value=>updates.push({index,value})]};const Component=new Function('React','useState','useEffect',code+';return InactiveUsers;')(React,useState,()=>{});const element=Component({token:'synthetic',Table:props=>React.createElement('table',props),Modal:props=>React.createElement('div',props),formatDate:value=>value});return {element,updates}}
function elements(node){if(!node||typeof node!=='object')return [];return [node,...React.Children.toArray(node.props?.children).flatMap(elements)]}
test('inactive count opens user details and date apply uses selected dates',()=>{
 const {element,updates}=view();const all=elements(element),button=all.find(node=>node.props?.['aria-label']==='View inactive user details');assert.ok(button);button.props.onClick();assert.equal(updates[0].index,5);assert.equal(updates[0].value(false),true);
 const form=all.find(node=>node.type==='form');form.props.onSubmit({preventDefault(){}});assert.deepEqual(updates.find(item=>item.index===2).value,{from:'2026-10-22',to:'2026-10-22'});
 const html=renderToStaticMarkup(view(true).element);assert.ok(html.includes('Person &lt;One&gt;'));assert.ok(html.includes('Production User'));assert.ok(html.includes('Site A'));assert.ok(html.includes('Last login'));assert.ok(html.includes('type="date"'));
});

 test('session summary uses the date-based inactive report and preserves it between tabs',()=>{
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(!main.includes('<small>Valid user logins</small>'));
 assert.ok(main.includes('<small>Inactive users</small>'));
 assert.ok(main.includes('Number(inactiveSummary.data.inactiveUsers)'));
 assert.ok(main.includes('onSummaryChange={setInactiveSummary}'));
 assert.ok(main.includes("hidden={status!=='Inactive users'}"));
 });
 test('inactive report publishes loaded, loading and error states to its summary',()=>{
 for(const state of [{loading:true,data:null,error:''},{loading:false,data:{inactiveUsers:3},error:''},{loading:false,data:null,error:'Unavailable'}]){
 let index=0,published;const effects=[];
 const values=['2026-10-22','2026-10-22',{from:'2026-10-22',to:'2026-10-22'},0,state,true,null];
 const Component=new Function('React','useState','useEffect',code+';return InactiveUsers;')(React,()=>[values[index++],()=>{}],effect=>effects.push(effect));
 const tree=Component({onSummaryChange:value=>{published=value},Table:()=>null,Modal:()=>null,formatDate:String});
 effects[1]();assert.equal(published,state);
 assert.ok(tree);
 }
 });
