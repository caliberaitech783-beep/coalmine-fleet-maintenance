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
  for(const expected of ['Original','Changed','Manager','05-10-26','Waiting for parts','breakdown-reason-history-overlay','request-timeline-content'])assert.ok(html.includes(expected));
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
test('reason history uses a bounded popup without changing the full-screen timeline',()=>{
  const css=readFileSync(new URL('../src/breakdown-reason-history.css',import.meta.url),'utf8');
  assert.match(source,/className="request-timeline-modal breakdown-reason-history-modal"/);
  assert.match(source,/overlayClassName="breakdown-reason-history-overlay"/);
  assert.match(css,/width: min\(960px, 100%\)/);
  assert.match(css,/height: auto/);
  assert.match(css,/max-height: calc\(100dvh - 40px\)/);
  assert.match(css,/border-radius: 14px/);
  assert.match(css,/overflow: auto/);
  assert.doesNotMatch(source,/window\.open|location\.(?:href|assign)|navigate\(/);
});
