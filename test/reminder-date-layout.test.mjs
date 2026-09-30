import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const find=(node,predicate)=>Array.isArray(node)?node.flatMap(child=>find(child,predicate)):React.isValidElement(node)?[...(predicate(node)?[node]:[]),...find(node.props.children,predicate)]:[];

test('both first-trip reminders can be dismissed without changing the pending queue',async()=>{
  const lines=main.split('\n').filter(line=>line.includes('vehicle/equipment first-trip entry pending after Maintenance made on road.'));
  assert.equal(lines.length,2);
  for(const line of lines){
    const expression=line.trim().slice(1,-1);
    const {code}=await transformWithOxc(`const render=()=>(${expression});`,'reminder.jsx',{jsx:{runtime:'classic'}});
    let dismissed=false,tab='requests';
    const rows=Array.from({length:1985},(_,id)=>({id}));
    const bindings={React,CheckCircle2:()=>null,X:()=>null,productionManagerView:true,isProductionWorker:true,isProductionManager:true,
      productionFirstTripRows:rows,setFirstTripReminderDismissed:value=>{dismissed=value;},setQueueTab:value=>{tab=value;},setTab:value=>{tab=value;}};
    const render=()=>new Function(...Object.keys(bindings),'firstTripReminderDismissed','tab',`${code};return render();`)(...Object.values(bindings),dismissed,tab);
    const tree=render();
    const close=find(tree,node=>node.props['aria-label']==='Dismiss first-trip reminder')[0];
    assert.equal(close.props.type,'button');
    close.props.onClick();
    assert.equal(render(),false);
    assert.equal(rows.length,1985);
    assert.equal(tab,'requests');
    dismissed=false;
    find(render(),node=>node.type==='button'&&node.props.children==='Open')[0].props.onClick();
    assert.ok(['firstTrip','productionFirstTrip'].includes(tab));
  }
});

test('date overlays reserve a separate picker area and toolbar fields wrap instead of shrinking',()=>{
  const css=readFileSync(new URL('../src/date-input.css',import.meta.url),'utf8');
  const table=readFileSync(new URL('../src/table-actions.css',import.meta.url),'utf8');
  assert.match(css,/min-width: calc\(12ch \+ 2\.25em\)/);
  assert.match(css,/padding-right: 2\.25em/);
  assert.match(css,/::before \{ right: 2\.25em; overflow: hidden/);
  assert.match(css,/::-webkit-calendar-picker-indicator \{\s*position: absolute; right: \.4em/);
  assert.match(table,/\.record-date-range > label \{[^}]*flex-wrap: wrap/);
  assert.match(table,/\.record-date-range\[role="group"\] > label \{[^}]*flex: 0 0 auto/);
});
