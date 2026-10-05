import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {formatDisplayDateTime} from '../date-time-format.mjs';

const source=readFileSync(new URL('../src/breakdown-reason-history.jsx',import.meta.url),'utf8');
const {code}=await transformWithOxc(source.replace(/^import .*;\r?\n/gm,'').replace('export default function','function'),'reason.jsx',{jsx:{runtime:'classic'}});
function render(state,reference='REQ-1'){
  let index=0;
  const values=[true,state,0];
  const Component=new Function('React','useEffect','useState','DailyUpdatesPanel','formatDisplayDateTime',code+';return BreakdownReasonHistory;')(
    React,()=>{},()=>[values[index++],()=>{}],({remarks})=>React.createElement('p',null,remarks.map(item=>item.remark).join(' · ')),formatDisplayDateTime);
  return renderToStaticMarkup(React.createElement(Component,{reference,reason:'Current reason',token:'test',Dialog:({children,...props})=>React.createElement('section',{'data-overlay':props.overlayClassName},children)}));
}
test('drilldown displays old/new reasons, actor, timestamp and daily remarks as safe text',()=>{
  const html=render({data:{request:{complaint:'Changed <script>text</script>',dailyRemarks:[{remark:'Waiting for parts'}]},reasonHistory:[{from:'Original',to:'Changed',changedBy:'Manager',changedAt:'2026-10-05T08:00:00Z'}]}});
  for(const expected of ['Original','Changed','Manager','05-10-26','Waiting for parts','request-timeline-overlay'])assert.ok(html.includes(expected));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});
test('history distinguishes loading, failure and missing historical data',()=>{
  assert.match(render(null),/Loading reasons/);
  assert.match(render({error:'Access denied'}),/Access denied.*Retry/s);
  assert.match(render({data:{request:{},reasonHistory:[]}}),/No saved reason changes/);
  assert.match(render({data:{request:{},reasonHistory:[]}}),/No daily remarks recorded/);
  assert.doesNotMatch(render(null,'—'),/Loading reasons/);
});
