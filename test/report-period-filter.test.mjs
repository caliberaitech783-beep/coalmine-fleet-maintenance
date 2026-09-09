import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
import * as model from '../src/report-period-model.mjs';
import {reportRowsWithinRange} from '../report-date-range.mjs';

test('all preset ranges use Monday weeks, inclusive fortnight and calendar boundaries',()=>{
  const expected={today:['2026-09-09','2026-09-09'],yesterday:['2026-09-08','2026-09-08'],last7:['2026-09-03','2026-09-09'],thisWeek:['2026-09-07','2026-09-09'],lastWeek:['2026-08-31','2026-09-06'],fortnight:['2026-08-27','2026-09-09'],last30:['2026-08-11','2026-09-09'],thisMonth:['2026-09-01','2026-09-09'],lastMonth:['2026-08-01','2026-08-31'],thisQuarter:['2026-07-01','2026-09-09'],thisYear:['2026-01-01','2026-09-09']};
  for(const [key] of model.PERIOD_PRESETS) assert.deepEqual(Object.values(model.presetDates(key,'2026-09-09')),expected[key]);
  assert.deepEqual(model.presetDates('lastMonth','2024-03-05'),{start:'2024-02-01',end:'2024-02-29'});
  assert.deepEqual(model.presetDates('thisWeek','2026-01-01'),{start:'2025-12-29',end:'2026-01-01'});
  assert.deepEqual(model.presetDates('thisWeek','2026-09-13'),{start:'2026-09-07',end:'2026-09-13'});
  assert.equal(model.indiaToday(new Date('2026-09-08T19:00:00Z')),'2026-09-09');
  assert.equal(model.shiftMonth('2026-01',-1),'2025-12');
  assert.equal(model.calendarDays('2024-02').filter(Boolean).length,29);
  assert.equal(model.calendarDays('2026-09')[1],'2026-09-01');
});
test('AM/PM and full final-minute boundaries preserve inclusive date filtering',()=>{
  for(const time of ['00:00','12:00','23:59','09:05']) assert.equal(model.timeFromParts(model.timeParts(time)),time);
  assert.equal(model.timeParts('00:00').period,'AM');
  assert.equal(model.timeParts('12:00').period,'PM');
  const range=model.periodBounds('2026-09-09','2026-09-09','00:00','23:59');
  const rows=[{at:'2026-09-09 00:00:00'},{at:'2026-09-09 23:59:59.999'},{at:'2026-09-10 00:00:00'}];
  assert.deepEqual(reportRowsWithinRange(rows,r=>r.at,range.from,range.to),rows.slice(0,2));
  assert.equal(model.periodBounds('2026-09-09','2026-09-08','00:00','23:59'),null);
  assert.equal(model.periodBounds('2026-09-09','2026-09-09','13:00','12:59'),null);
  assert.equal(model.periodBounds('2026-02-30','2026-03-01','00:00','23:59'),null);
});
const source=readFileSync(new URL('../src/report-period-filter.jsx',import.meta.url),'utf8');
const code=(await transformWithOxc(source.replace(/^import .*;\r?$/gm,'').replaceAll('export default function ','function ').replaceAll('export function ','function '),'period.jsx',{jsx:{runtime:'classic'}})).code;
function harness() {
  let index=0;const slots=[],applied=[],closed=[];
  const useState=initial=>{const key=index++;if(!(key in slots))slots[key]=typeof initial==='function'?initial():initial;return [slots[key],value=>slots[key]=typeof value==='function'?value(slots[key]):value];};
  const names=['React','useState','useEffect','useRef','useId','createPortal','document',...Object.keys(model),'Filter','ChevronLeft','ChevronRight','X','CalendarDays'];
  const values=[React,useState,()=>{},()=>({current:null}),()=>'qa',tree=>tree,{body:{}},...Object.values(model),...Array(5).fill(()=>null)];
  const component=new Function(...names,`${code};return ReportPeriodDialog;`)(...values);
  return {applied,closed,render(){index=0;return component({from:'2026-09-01T00:00:00',to:'2026-09-09T23:59:59.999',onApply:(...args)=>applied.push(args),onClose:()=>closed.push(true)});}};
}
const all=(tree,predicate)=>{const result=[];const visit=n=>{if(Array.isArray(n))return n.forEach(visit);if(!React.isValidElement(n))return;if(predicate(n))result.push(n);visit(n.props.children);};visit(tree);return result;};
const text=node=>Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):String(node??'');
const button=(tree,label)=>all(tree,n=>n.type==='button'&&text(n.props.children)===label)[0];
test('calendar edits are draft-only; Apply commits, Cancel discards, and Clear resets',()=>{
  const app=harness();let tree=app.render();
  button(tree,'Fortnight').props.onClick();tree=app.render();
  assert.deepEqual(app.applied,[]);
  button(tree,'Cancel').props.onClick();assert.equal(app.closed.length,1);assert.deepEqual(app.applied,[]);
  const selected=model.presetDates('fortnight');
  all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  assert.deepEqual(app.applied[0],[`${selected.start}T00:00:00`,`${selected.end}T23:59:59.999`]);
  button(tree,'Clear').props.onClick();assert.deepEqual(app.applied[1],['','']);
});
test('two calendar clicks select an ordered range and disable Apply for unfinished selection',()=>{
  const app=harness();let tree=app.render();
  const choose=day=>{all(tree,n=>n.type==='button'&&n.props['aria-label']?.startsWith(day))[0].props.onClick();tree=app.render();};
  choose('08-09-2026');assert.equal(button(tree,'Apply').props.disabled,true);
  choose('03-09-2026');assert.equal(button(tree,'Apply').props.disabled,false);
  all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  assert.deepEqual(app.applied[0],['2026-09-03T00:00:00','2026-09-08T23:59:59.999']);
});
test('shared popup replaces the inline date controls for every selected report',()=>{
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(main,/selectedReport && <ReportPeriodFilter from=\{reportFrom\} to=\{reportTo\}/);
  assert.doesNotMatch(main,/type="datetime-local" value=\{reportFrom\}/);
  assert.match(source,/element.showModal\(\)/);
  assert.match(source,/onCancel=/);
  assert.match(source,/focus\.focus\(\)/);
});
