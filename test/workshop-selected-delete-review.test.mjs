import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
const source=readFileSync(new URL('../src/workshop-selected-delete.jsx',import.meta.url),'utf8');
const {code}=await transformWithOxc(source.replace(/^import .*;\r?\n/gm,'').replace('export function','function'),'review.jsx',{jsx:{runtime:'classic'}});
function setup({reason='',busy=false,error='',onDelete=async()=>{},records}={}) {
  let index=0,closed=false; const values=[reason,busy,error]; const updates=[];
  const Component=new Function('React','useState',code+';return RequestDeleteReview;')(React,()=>{const position=index++;return [values[position],value=>updates.push([position,value])];});
  const rows=records||Array.from({length:12},(_,i)=>({ref:`REQ-${i+1}`,door:`D-${i+1}`,site:'Mine <A>',status:'Closed',start:'start',closedAt:'closed',verifiedAt:'verified',complaint:'Repair engine'}));
  const tree=Component({records:rows,onDelete,onClose:()=>{closed=true},Modal:({children})=>React.createElement('section',null,children),formatDateTime:value=>`formatted ${value}`});
  const find=(node,predicate)=>Array.isArray(node)?node.flatMap(item=>find(item,predicate)):React.isValidElement(node)?[...(predicate(node)?[node]:[]),...find(node.props.children,predicate)]:[];
  return {tree,updates,closed:()=>closed,buttons:find(tree,node=>node.type==='button')};
}
test('review lists every selected record with equipment, site, status and lifecycle dates',()=>{
  const {tree}=setup(); const html=renderToStaticMarkup(tree);
  assert.equal((html.match(/<li>/g)||[]).length,12);
  for(const text of ['REQ-12','D-12','Mine &lt;A&gt;','Status: Closed','Started: formatted start','Closed: formatted closed','Verified: formatted verified','Reason for deletion'])assert.ok(html.includes(text),text);
  assert.match(html,/cannot be undone/);
});
test('confirmation requires a reason and stays disabled while deletion is in progress',()=>{
  assert.equal(setup().buttons.at(-1).props.disabled,true);
  assert.equal(setup({reason:'Remove demo data'}).buttons.at(-1).props.disabled,false);
  assert.equal(setup({reason:'Remove demo data',busy:true}).buttons.at(-1).props.disabled,true);
});
test('confirm sends exactly reviewed references and the trimmed audit reason',async()=>{
  let args;const view=setup({reason:' Remove demo data ',onDelete:async(...values)=>{args=values;}});
  await view.buttons.at(-1).props.onClick();
  assert.deepEqual(args,[Array.from({length:12},(_,i)=>`REQ-${i+1}`),'Remove demo data']);assert.equal(view.closed(),true);
});
test('failed deletion keeps the review open and exposes the error for retry',async()=>{
  const view=setup({reason:'Remove demo data',onDelete:async()=>{throw new Error('Request changed');}});
  await view.buttons.at(-1).props.onClick();assert.equal(view.closed(),false);assert.ok(view.updates.some(([index,value])=>index===2&&value==='Request changed'));
});
