import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
const source=readFileSync(new URL('../src/downtime-matrix-report.jsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('export function ReportTimeSelect'),source.indexOf('\nconst hours')).replace('export function','function');
const {code}=await transformWithOxc(body,'report-time-select.jsx',{jsx:{runtime:'classic'}});
const ReportTimeSelect=new Function('React',`${code};return ReportTimeSelect;`)(React);
function selects(tree){return React.Children.toArray(tree.props.children).map(part=>React.Children.toArray(part.props.children).find(node=>node.type==='select'));}
test('report time dropdowns retain all 24 hours and exact minutes and seconds',()=>{
  for(let hour=0;hour<24;hour++)for(const minute of ['00','17','59'])for(const second of ['00','23','59']){
    const value=`${String(hour).padStart(2,'0')}:${minute}:${second}`;
    let saved;
    const fields=selects(ReportTimeSelect({label:'From time',value,onChange:next=>saved=next}));
    assert.deepEqual(fields.map(field=>field.props.value),[String(hour%12||12).padStart(2,'0'),minute,second,minute==='00'&&second==='00'&&(hour===0||hour===12)?(hour===12?'Noon':'Midnight'):(hour>=12?'PM':'AM')]);
    assert.deepEqual(fields.map(field=>React.Children.count(field.props.children)),[12,60,60,4]);
    assert.ok(fields.every(field=>field.props.required));
    fields[0].props.onChange({target:{value:fields[0].props.value}});
    assert.equal(saved,value,'selection round-trips without losing seconds');
  }
});
test('hour, minute, second and period changes emit valid 24-hour values',()=>{
  let value='00:00:00';
  const field=part=>selects(ReportTimeSelect({label:'To time',value,onChange:next=>value=next})).find(node=>node.props['aria-label']===`To time ${part}`);
  field('period').props.onChange({target:{value:'PM'}});assert.equal(value,'12:00:00');
  field('hour').props.onChange({target:{value:'01'}});assert.equal(value,'13:00:00');
  field('minute').props.onChange({target:{value:'45'}});assert.equal(value,'13:45:00');
  field('second').props.onChange({target:{value:'59'}});assert.equal(value,'13:45:59');
  field('period').props.onChange({target:{value:'AM'}});assert.equal(value,'01:45:59');
});
test('midnight/noon labels are explicit and minute-only defaults are preserved',()=>{
  const fields=selects(ReportTimeSelect({label:'From time',value:'00:00',onChange:()=>{}}));
  assert.deepEqual(fields.map(field=>field.props.value),['12','00','00','Midnight']);
  assert.deepEqual(React.Children.toArray(fields[3].props.children).map(option=>option.props.children),['Noon','Midnight','AM','PM']);
  const normal=selects(ReportTimeSelect({label:'To time',value:'23:59',onChange:()=>{}}));
  assert.deepEqual(normal.map(field=>field.props.value),['11','59','00','PM']);
  assert.deepEqual(React.Children.toArray(normal[3].props.children).map(option=>option.props.children),['Noon','Midnight','AM','PM']);
  assert.match(source,/<ReportTimeSelect label="From time"/);
  assert.match(source,/<ReportTimeSelect label="To time"/);
});

test('Noon and Midnight set exact times and subsequent edits retain the correct half-day',()=>{
  for(const label of ['From time','To time']){
    let value='21:38:47';
    const fields=()=>selects(ReportTimeSelect({label,value,onChange:next=>value=next}));
    for(const [choice,expected,hourChange] of [['Noon','12:00:00','13:00:00'],['Midnight','00:00:00','01:00:00']]){
      fields()[3].props.onChange({target:{value:choice}});assert.equal(value,expected);
      assert.equal(fields()[3].props.value,choice);
      fields()[0].props.onChange({target:{value:'01'}});assert.equal(value,hourChange);
    }
    value='12:35:29';fields()[3].props.onChange({target:{value:'AM'}});assert.equal(value,'00:35:29');
    fields()[3].props.onChange({target:{value:'PM'}});assert.equal(value,'12:35:29');
  }
});
