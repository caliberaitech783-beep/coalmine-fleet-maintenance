import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {TENURE_MONTHS, buildEmployeeTenureReport} from '../src/employee-tenure.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import DateInput from '../src/date-input.mjs';

const source=readFileSync(new URL('../src/employee-tenure-report.jsx',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
const {code}=await transformWithOxc(source,'employee-tenure-report.jsx',{jsx:{runtime:'classic'}});
test('employee report passes exact tenure and six requested columns to the exportable report and hides stale sessions',()=>{
  const slots=['2026-09-30',3,0,{token:'fixture',loading:false,error:'',directory:{matrix:{site:[
    {empId:'E1',name:'Example employee',status:'ACTIVE',dojISO:'2026-06-15',department:'HR',designation:'Officer'},
    {empId:'E2',name:'Former employee',status:'RESIGNED',dojISO:'2020-01-01'},
  ]}}}];
  let cursor=0, received;
  const Section=props=>{received=props;return React.createElement('div',null,props.rows.map(row=>row.label).join(','));};
  const bindings={React,DateInput,formatDisplayDate,TENURE_MONTHS,buildEmployeeTenureReport,useMemo:fn=>fn(),useEffect:()=>{},useState(initial){const i=cursor++;return [slots[i] ?? initial,value=>{slots[i]=value;}];}};
  const Component=new Function(...Object.keys(bindings),code+'; return EmployeeTenureReport;')(...Object.values(bindings));
  const render=token=>{cursor=0;return renderToStaticMarkup(Component({token,ReportSection:Section}));};
  assert.match(render('fixture'),/3M - 15 D/);
  assert.deepEqual(received.columns.map(c=>c.label),['Employee ID','Employee name','Department','Designation','Joining date','Working tenure']);
  assert.deepEqual(received.columns.map(c=>c.value(received.rows[0])),['E1','Example employee','HR','Officer','15-06-2026','3M - 15 D']);
  assert.match(received.title,/30-09-2026/);
  assert.equal(received.rows.length,1);
  slots[1]=6;
  render('fixture');
  assert.equal(received.rows.length,0);
  assert.match(render('different-session'),/Loading employee records/);
  slots[3]={token:'fixture',loading:false,error:'Cannot load roster',directory:null};
  assert.match(render('fixture'),/role="alert"/);
});
