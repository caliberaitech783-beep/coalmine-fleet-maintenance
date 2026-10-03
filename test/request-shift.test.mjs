import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
import * as model from '../src/table-actions-model.mjs';
import * as shifts from '../request-shift.mjs';
import {SHIFT_MASTER_DEFAULTS} from '../shift-master.mjs';
import {withSerialColumn} from '../serial-column.mjs';

test('request shift follows site-specific boundaries, overnight and saved history',()=>{
  const label=(site,start)=>shifts.requestShiftLabel({site,start},SHIFT_MASTER_DEFAULTS);
  assert.equal(label('Jayant OC','2026-10-03 11:59:59'),'Shift A');
  assert.equal(label('Jayant OC','2026-10-03 12:00:00'),'Shift B');
  assert.equal(label('Sasti OC','2026-10-03 12:00:00'),'Shift A');
  assert.equal(label('Sasti OC','2026-10-03 23:30:00'),'Shift C');
  assert.equal(label('Sasti OC','2026-10-04 04:59:59'),'Shift C');
  assert.equal(label('Unknown','2026-10-03 12:00:00'),'Shift not set');
  assert.equal(shifts.requestShiftLabel({requestShift:'Shift A'},[]),'Shift A');
  const inactive=SHIFT_MASTER_DEFAULTS.map(row=>({...row,status:'Inactive'}));
  assert.equal(shifts.requestShiftLabel({site:'Jayant OC',start:'2026-10-03 12:00:00'},inactive),'Shift not set');
});

test('Shift stays first in request exports without duplicate serial numbers or changing summaries',()=>{
  const rows=[{ref:'REQ-1',site:'Jayant OC',start:'2026-10-03 12:00:00'}];
  const columns=shifts.requestShiftColumns([{key:'ref',label:'Job reference'}],rows,SHIFT_MASTER_DEFAULTS);
  assert.equal(columns[0].value(rows[0]),'Shift B');
  const data=withSerialColumn(columns,[['Shift B','REQ-1']]);
  assert.deepEqual(data.columns.map(c=>c.label),['Shift','Sr. No.','Job reference']);
  assert.deepEqual(data.rows,[['Shift B','1','REQ-1']]);
  assert.deepEqual(withSerialColumn(columns.map(({label})=>({label})),[['Shift B','REQ-1']]).rows,data.rows);
  assert.deepEqual(withSerialColumn(data.columns,data.rows),data);
  assert.deepEqual(model.ensureJobReferenceVisibleKeys(['ref'],columns),['requestShift','ref']);
  const summary=[{key:'count',label:'Count'}];
  assert.equal(shifts.requestShiftColumns(summary,[{count:3}],SHIFT_MASTER_DEFAULTS),summary);
});

test('shared request table adds matching shift cells and retains non-request tables',async()=>{
  const source=readFileSync(new URL('../src/request-shift-context.jsx',import.meta.url),'utf8');
  const {code}=await transformWithOxc(source.replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),'request-shift.jsx',{jsx:{runtime:'classic'}});
  const dependencies={React,...React,...model,...shifts};
  const exports=new Function(...Object.keys(dependencies),code+';return {withRequestShiftCells};')(...Object.values(dependencies));
  const h=React.createElement;
  const Reference=()=>null;
  const children=[h('thead',{},h('tr',{},h('th',{},'Job reference'),h('th',{},'Started'))),h('tbody',{},h('tr',{},h('td',{},h(Reference,{reference:'REQ-1'})),h('td',{},'date')))];
  const result=model.tableModel(exports.withRequestShiftCells(children,{loading:false,shifts:SHIFT_MASTER_DEFAULTS,requests:new Map([['REQ-1',{requestShift:'Shift C'}]])}));
  assert.equal(result.columns[0].label,'Shift');
  assert.equal(result.columns[0].value(model.tableElements(result.sections[1].props.children)[0]),'Shift C');
  const master=[h('thead',{},h('tr',{},h('th',{},'Name')))];
  assert.equal(exports.withRequestShiftCells(master,{}),master);
});
