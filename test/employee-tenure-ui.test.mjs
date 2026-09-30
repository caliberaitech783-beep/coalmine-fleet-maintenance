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
  assert.match(render('fixture'),/0Y 3M 15D/);
  assert.deepEqual(received.columns.map(c=>c.label),['Employee ID','Employee name','Department','Designation','Joining date','Working tenure']);
  assert.deepEqual(received.columns.map(c=>c.value(received.rows[0])),['E1','Example employee','HR','Officer','15-06-26','0Y 3M 15D']);
  assert.match(received.title,/30-09-26/);
  assert.equal(received.rows.length,1);
  for (const label of ['Site', 'Region', 'Department', 'Category', 'Designation']) assert.match(render('fixture'), new RegExp(`aria-label="${label}"`));
  slots[4]={department:'Other department'};
  render('fixture');
  assert.equal(received.rows.length,0, 'exports use the same filtered rows');
  assert.match(received.title,/Department: Other department/);
  slots[4]={department:'HR'};
  render('fixture');
  assert.equal(received.rows.length,1);
  slots[3].directory.matrix.site.push({empId:'E3',name:'Missing date employee',status:'ACTIVE',department:'Only excluded',designation:'Officer',dojISO:''});
  slots[4]={};
  slots[6]='excluded';
  const excludedHtml=render('fixture');
  assert.match(excludedHtml,/Only excluded/,'filter options include employees without joining dates');
  assert.match(renderToStaticMarkup(received.headingControl),/Excluded employees \(1\)/);
  assert.doesNotMatch(excludedHtml,/Employee report view/);
  assert.equal(received.rows[0].empId,'E3');
  assert.equal(received.rows[0].reason,'Missing joining date');
  assert.ok(received.columns.some(column=>column.label==='Exclusion reason'));
  assert.equal(received.showSearch,false);
  slots[7]='Invalid joining date';
  render('fixture');
  assert.equal(received.rows.length,0);
  slots[6]='included';
  slots[7]='';
  slots[4]={department:'HR'};
  slots[1]=6;
  render('fixture');
  assert.equal(received.rows.length,0);
  assert.match(render('different-session'),/Loading employee records/);
  slots[3]={token:'fixture',loading:false,error:'Cannot load roster',directory:null};
  assert.match(render('fixture'),/role="alert"/);
});

test('tenure header puts the controlled search before Refresh and removes explanatory paragraph', async () => {
  const component=readFileSync(new URL('../src/employee-tenure-report.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(component, /<p>Currently working employees only/);
  assert.match(component,/type="search"[\s\S]*?>Refresh<\/button>/);
  assert.match(component,/query=\{search\} showSearch=\{false\}/);
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const section=main.slice(main.indexOf('function ReportSection('), main.indexOf('\nfunction ',main.indexOf('function ReportSection(')+1));
  const {code: sectionCode}=await transformWithOxc(section,'report-section.jsx',{jsx:{runtime:'classic'}});
  let tableProps;
  const Null=()=>null;
  const scope={React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],FileBarChart:Null,ExportMenu:Null,Search:Null,ReportTable:props=>{tableProps=props;return null;}};
  const Section=new Function(...Object.keys(scope),sectionCode+'; return ReportSection;')(...Object.values(scope));
  const html=renderToStaticMarkup(React.createElement(Section,{title:'Employee tenure',query:'Example',showSearch:false}));
  assert.equal(tableProps.query,'Example');
  assert.doesNotMatch(html,/Search this report/);
  const defaultHtml=renderToStaticMarkup(React.createElement(Section,{title:'Other report'}));
  assert.match(defaultHtml,/Search this report/);
});
