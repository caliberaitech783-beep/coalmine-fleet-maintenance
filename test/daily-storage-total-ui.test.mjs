import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';

const source=readFileSync(new URL('../src/daily-storage-analysis.jsx',import.meta.url),'utf8');
const {code}=await transformWithOxc(source.replace(/^import .*;\r?\n/gm,'').replace('export default function','function'),'daily-storage.jsx',{jsx:{runtime:'classic'}});

test('daily total sums all media sources as bytes before rounding and isolates dates',()=>{
  const media=[
    ...['images','images','audio','videos','other'].map(kind=>({day:'2026-10-17',kind,bytes:'528482',files:1})),
    {day:'2026-10-18',kind:'images',bytes:'1048576',files:1},
    {day:'Unknown date',kind:'other',bytes:'0',files:1},
  ];
  const states=[{media,reports:[],checkedAt:'2026-10-25T00:00:00Z'},false,''];
  let index=0;
  const Component=new Function('React','useState',code+';return DailyStorageAnalysis;')(React,()=>[states[index++],()=>{}]);
  const html=renderToStaticMarkup(React.createElement(Component,{token:'test'}));
  assert.match(html,/<th>Total space used \(MB\)<\/th>/);
  for(const [day,total] of [['2026-10-17','2.52'],['2026-10-18','1.00'],['Unknown date','0.00']]){
    const row=html.match(new RegExp(`<tr><th>${day}</th>(.*?)</tr>`))[1];
    assert.ok(row.endsWith(`<td>${total}</td>`),row);
    assert.equal((row.match(/<td>/g)||[]).length,5);
  }
});
