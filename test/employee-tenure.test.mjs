import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {employeeTenure, buildEmployeeTenureReport, TENURE_MONTHS} from '../src/employee-tenure.mjs';

test('tenure uses calendar months and remaining days, including month ends and leap years', () => {
  assert.equal(employeeTenure('2023-07-15','2026-09-30').label,'3Y 2M 15D');
  assert.equal(employeeTenure('2023-10-06','2026-09-30').label,'2Y 11M 24D');
  assert.deepEqual(employeeTenure('2026-06-15','2026-09-30'), {months:3,days:15,label:'0Y 3M 15D'});
  assert.equal(employeeTenure('2026-07-01','2026-09-30').label,'0Y 2M 29D');
  assert.equal(employeeTenure('2026-01-31','2026-04-30').label,'0Y 3M 0D');
  assert.equal(employeeTenure('2024-02-29','2025-02-28').label,'1Y 0M 0D');
  assert.equal(employeeTenure('2024-02-29','2025-03-01').label,'1Y 0M 1D');
  for (const date of ['', '2026-02-30','2026-10-01']) assert.equal(employeeTenure(date,'2026-09-30'),null);
});

test('report includes active employees at three months, excludes former staff and deduplicates IDs', () => {
  const employee = (empId,dojISO,status='ACTIVE')=>({empId,dojISO,status,name:empId,department:'HR',designation:'Officer'});
  const directory={matrix:{a:[employee('eligible','2026-06-30'),employee('recent','2026-07-01'),employee('left','2020-01-01','RESIGNED'),employee('vacant','2020-01-01','VACANT'),employee('unknown',''),employee('future','2027-01-01'),employee('old','2020-01-01')],b:[employee('eligible','2026-06-30')]}};
  const report=buildEmployeeTenureReport(directory,'2026-09-30');
  assert.deepEqual(report.rows.map(row=>row.empId),['old','eligible']);
  assert.equal(report.missingDates,1);
  assert.equal(report.rows[1].label,'0Y 3M 0D');
  assert.deepEqual(buildEmployeeTenureReport(directory,'2026-09-30',60).rows.map(row=>row.empId),['old']);
  assert.deepEqual(TENURE_MONTHS,[3,6,9,12,24,36,48,60]);
});

test('C-Dir menu puts directory first, then employee tenure and masters and uses live employee data', () => {
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.ok(!source.includes('{id: "employee-tenure", label:'));
  assert.match(source,/cdir-dropdown[\s\S]*?data-workspace="directory"[\s\S]*?data-workspace="report-employee-tenure"[\s\S]*?ClockMenu label="C-Dir Masters"/);
  assert.match(source,/active === "Employee Tenure Report" \? \([\s\S]*?<EmployeeTenureReport/);
  const component=readFileSync(new URL('../src/employee-tenure-report.jsx',import.meta.url),'utf8');
  for(const label of ['Employee ID','Employee name','Department','Designation','Joining date','Working tenure']) assert.ok(component.includes(`label: '${label}'`));
  assert.ok(component.includes("fetch('/api/cdir/directory'"));
  assert.ok(component.includes('ReportSection title='));
  assert.ok(component.includes('data.token === token'));
});

test('site, region, department, category and designation filters intersect using C-Dir matrix assignments', () => {
  const person=(id,department,designation)=>({empId:id,name:id,status:'ACTIVE',dojISO:'2023-01-01',department,designation});
  const directory={sites:[{id:'s1',label:'Site one',group:'WCL'},{id:'s2',label:'Site two',group:'NCL'}],matrix:{
    's1|A':[person('E1','HR','Officer')], 's1|B':[person('E2','Mining','Supervisor')],
    's2|A':[person('E3','HR','Officer')], 's2|B':[person('E4','Mining','Manager')],
  }};
  const ids=filters=>buildEmployeeTenureReport(directory,'2026-09-30',3,filters).rows.map(row=>row.empId);
  assert.deepEqual(ids({site:'Site one'}),['E1','E2']);
  assert.deepEqual(ids({region:'NCL'}),['E3','E4']);
  assert.deepEqual(ids({department:'HR'}),['E1','E3']);
  assert.deepEqual(ids({category:'B'}),['E2','E4']);
  assert.deepEqual(ids({designation:'Supervisor'}),['E2']);
  assert.deepEqual(ids({site:'Site one',region:'WCL',department:'HR',category:'A',designation:'Officer'}),['E1']);
  assert.deepEqual(ids({site:'Site one',region:'NCL'}),[]);
  assert.equal(ids({}).length,4);
});

test('excluded details retain raw invalid dates, match scope and never include former or recent employees', () => {
  const employee=(empId,dojISO,extra={})=>({empId,name:empId,status:'ACTIVE',dojISO,department:'HR',designation:'Officer',...extra});
  const directory={sites:[{id:'s',label:'Office',group:'CORP'}],matrix:{'s|A':[
    employee('Missing',''),employee('Invalid','',{dojRaw:'not a date'}),employee('Impossible','2026-02-30'),
    employee('Former','',{status:'RESIGNED'}),employee('Recent','2026-09-01'),employee('Future','2027-01-01'),
  ]}};
  const report=buildEmployeeTenureReport(directory,'2026-09-30',60,{site:'Office',category:'A'});
  assert.equal(report.rows.length,0);
  assert.equal(report.missingDates,3);
  assert.deepEqual(report.excludedRows.map(row=>[row.empId,row.reason]),[['Impossible','Invalid joining date'],['Invalid','Invalid joining date'],['Missing','Missing joining date']]);
  assert.equal(report.excludedRows[1].joiningDate,'not a date');
  assert.equal(report.excludedRows[0].region,'CORP');
  assert.equal(buildEmployeeTenureReport(directory,'2026-09-30',3,{site:'Elsewhere'}).excludedRows.length,0);
  assert.deepEqual(buildEmployeeTenureReport(directory,'invalid').excludedRows,[]);
});
