import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
import {lifecycleClockValue} from '../src/lifecycle-time-input.mjs';

const source=readFileSync(new URL('../src/lifecycle-time-controls.jsx',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
const {code}=await transformWithOxc(source,'lifecycle-time-controls.jsx',{jsx:{runtime:'classic'}});
function harness(props={}){
 const state=[];let cursor=0;const applied=[];
 const useState=initial=>{const index=cursor++;if(!(index in state))state[index]=typeof initial==='function'?initial():initial;return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];};
 const Component=new Function('React','useState','lifecycleClockValue',`${code};return LifecycleTimeControls;`)(React,useState,lifecycleClockValue);
 const render=()=>{cursor=0;return Component({...props,onApply:(...values)=>applied.push(values)});};
 const walk=(predicate,node)=>{if(Array.isArray(node)){for(const child of node){const found=walk(predicate,child);if(found)return found;}return null;}if(!React.isValidElement(node))return null;return predicate(node)?node:walk(predicate,node.props.children);};
 const find=predicate=>walk(predicate,render());
 return {applied,find,change:(label,value)=>find(node=>node.props['aria-label']===label).props.onChange({target:{value}}),apply:()=>find(node=>node.type==='button').props.onClick()};
}
test('AM/PM conversion handles hour-only typing, noon and midnight and rejects malformed values',()=>{
 assert.equal(lifecycleClockValue('01','PM'),'13:00');
 assert.equal(lifecycleClockValue('12:00','AM'),'00:00');
 assert.equal(lifecycleClockValue('12:00','PM'),'12:00');
 assert.equal(lifecycleClockValue('02:15','AM'),'02:15');
 for(const clock of ['13:00','01:99','abc'])assert.equal(lifecycleClockValue(clock,'PM'),null);
 assert.equal(lifecycleClockValue('01:00','invalid'),null);
 assert.equal(lifecycleClockValue('','AM'),'');
});
test('editing either time or AM/PM only updates drafts; Apply commits the complete pair',()=>{
 const ui=harness();
 ui.change('Request lifecycle from time','01');ui.change('Request lifecycle from AM or PM','PM');
 ui.change('Request lifecycle to time','02:30');ui.change('Request lifecycle to AM or PM','PM');
 assert.deepEqual(ui.applied,[]);ui.apply();assert.deepEqual(ui.applied,[['13:00','14:30']]);
 assert.equal(ui.find(node=>node.props['aria-label']==='Request lifecycle from time').props.value,'01:00');
 ui.change('Request lifecycle from time','');ui.change('Request lifecycle to time','');
 assert.equal(ui.applied.length,1);ui.apply();assert.deepEqual(ui.applied[1],['','']);
});
test('invalid input cannot apply and existing values show an explicit period',()=>{
 const ui=harness({from:'13:00',to:'00:30'});
 assert.equal(ui.find(node=>node.props['aria-label']==='Request lifecycle from time').props.value,'01:00');
 assert.equal(ui.find(node=>node.props['aria-label']==='Request lifecycle from AM or PM').props.value,'PM');
 assert.equal(ui.find(node=>node.props['aria-label']==='Request lifecycle to AM or PM').props.value,'AM');
 ui.change('Request lifecycle from time','25:90');ui.apply();
 assert.deepEqual(ui.applied,[]);assert.ok(ui.find(node=>node.props.role==='alert'));
});
