import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {birthdayNames,currentBirthdayNames} from '../info-pulse-birthdays.mjs';

test('birthdays use India calendar day, active employees and stable deduplication',()=>{
  const person={empId:'1',name:'Today',status:'ACTIVE',dobMonth:9,dobDay:27,contact:'private',dobISO:'1990-09-27'};
  const roster={matrix:{one:[person,{...person,empId:'2',name:'Yesterday',dobDay:26},{...person,empId:'3',name:'Inactive',status:'INACTIVE'}],two:[person]}};
  assert.deepEqual(birthdayNames(roster,new Date('2026-09-26T18:29:59Z')),['Yesterday']);
  assert.deepEqual(birthdayNames(roster,new Date('2026-09-26T18:30:00Z')),['Today']);
  assert.deepEqual(birthdayNames(roster,new Date('2026-10-27T12:00:00Z')),[]);
  assert.deepEqual(birthdayNames({},new Date()),[]);
});
test('bundled employee roster is readable and only returns names',async()=>{
  const names=await currentBirthdayNames(new Date('2026-09-26T12:00:00Z'));
  assert.ok(Array.isArray(names));
  assert.ok(names.every(name=>typeof name==='string'));
});
const source=readFileSync(new URL('../src/info-pulse-birthday.jsx',import.meta.url),'utf8');
const stripped=source.replace(/^import .*;\r?\n/gm,'').replace(/export default /g,'').replace(/export /g,'');
const {code}=await transformWithOxc(stripped,'birthday.jsx',{jsx:{runtime:'classic'}});
test('birthday banner hides empty state, escapes names and supports pause',()=>{
  let paused=false;
  const Component=new Function('React','useState','Pause','Play',code+';return BirthdayMarquee;')(React,()=>[paused,value=>{paused=value(paused);}],()=>null,()=>null);
  assert.equal(Component({names:[]}),null);
  const tree=Component({names:['A < B','Second Person']});
  const html=renderToStaticMarkup(tree);
  assert.match(html,/A &lt; B/);
  assert.match(html,/Happy Birthday!/);
  assert.match(html,/Today&#x27;s birthdays: A &lt; B, Second Person/);
  const button=tree.props.children.at(-1);
  button.props.onClick();
  assert.equal(Component({names:['Person']}).props['data-paused'],true);
});
test('birthday endpoint is authenticated and animations honor reduced motion',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(server,/app.get\('\/api\/info-pulse\/birthdays',requireSession/);
  assert.match(source,/\[token,today\]/);
  assert.match(source,/result\?\.today===today/);
  const css=readFileSync(new URL('../src/info-pulse-birthday.css',import.meta.url),'utf8');
  assert.match(css,/translateX\(-50%\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
