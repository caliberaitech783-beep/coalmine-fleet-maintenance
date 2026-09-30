import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {employeeTenure, buildEmployeeTenureReport, TENURE_MONTHS} from '../src/employee-tenure.mjs';

test('tenure uses calendar months and remaining days, including month ends and leap years', () => {
  assert.deepEqual(employeeTenure('2026-06-15','2026-09-30'), {months:3,days:15,label:'3M - 15 D'});
  assert.equal(employeeTenure('2026-07-01','2026-09-30').label,'2M - 29 D');
  assert.equal(employeeTenure('2026-01-31','2026-04-30').label,'3M - 0 D');
  assert.equal(employeeTenure('2024-02-29','2025-02-28').label,'12M - 0 D');
  assert.equal(employeeTenure('2024-02-29','2025-03-01').label,'12M - 1 D');
  for (const date of ['', '2026-02-30','2026-10-01']) assert.equal(employeeTenure(date,'2026-09-30'),null);
});

test('report includes active employees at three months, excludes former staff and deduplicates IDs', () => {
  const employee = (empId,dojISO,status='ACTIVE')=>({empId,dojISO,status,name:empId,department:'HR',designation:'Officer'});
  const directory={matrix:{a:[employee('eligible','2026-06-30'),employee('recent','2026-07-01'),employee('left','2020-01-01','RESIGNED'),employee('vacant','2020-01-01','VACANT'),employee('unknown',''),employee('future','2027-01-01'),employee('old','2020-01-01')],b:[employee('eligible','2026-06-30')]}};
  const report=buildEmployeeTenureReport(directory,'2026-09-30');
  assert.deepEqual(report.rows.map(row=>row.empId),['old','eligible']);
  assert.equal(report.missingDates,1);
  assert.equal(report.rows[1].label,'3M - 0 D');
  assert.deepEqual(buildEmployeeTenureReport(directory,'2026-09-30',60).rows.map(row=>row.empId),['old']);
  assert.deepEqual(TENURE_MONTHS,[3,6,9,12,24,36,48,60]);
});

test('Reports menu puts employee tenure immediately below vehicle history and uses live employee data', () => {
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(source,/id: "vehicle-history"[^\n]+\r?\n\s*\{id: "employee-tenure", label: "Employee Tenure Report"/);
  assert.match(source,/activeReportCategory === "employee-tenure"[\s\S]*?<EmployeeTenureReport/);
  const component=readFileSync(new URL('../src/employee-tenure-report.jsx',import.meta.url),'utf8');
  for(const label of ['Employee ID','Employee name','Department','Designation','Joining date','Working tenure']) assert.ok(component.includes(`label: '${label}'`));
  assert.ok(component.includes("fetch('/api/cdir/directory'"));
  assert.ok(component.includes('ReportSection title='));
  assert.ok(component.includes('data.token === token'));
});
