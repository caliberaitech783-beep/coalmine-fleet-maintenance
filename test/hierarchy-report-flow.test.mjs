import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {flowDesignationForUser,reportsDueForDesignation} from '../hierarchy-report-flow.mjs';

test('Director receives one daily 7 PM group excluding weekly-only fleet reports on weekdays',()=>{
  const due=reportsDueForDesignation('director',new Date('2026-09-01T13:35:00Z'));
  assert.equal(due.length,1);
  assert.equal(due[0].scheduleKey,'daily-19');
  assert.equal(due[0].reports.length,11);
  assert.equal(due[0].reports.includes(DIRECTOR_REPORT_TITLES[4]),false);
  assert.equal(due[0].reports.includes(DIRECTOR_REPORT_TITLES[5]),false);
});

test('Director weekly fleet reports are due on Saturday at 7 PM with the daily group',()=>{
  const due=reportsDueForDesignation('director',new Date('2026-09-05T13:35:00Z'));
  assert.deepEqual(due.map((group)=>group.scheduleKey).sort(),['daily-19','weekly-sat-19']);
  assert.equal(new Set(due.flatMap((group)=>group.reports)).size,13);
});

test('Project manager receives common reports at 8 AM and operational reports at 7 PM',()=>{
  const morning=reportsDueForDesignation('projectManager',new Date('2026-09-01T02:35:00Z'));
  assert.deepEqual(morning.map((group)=>group.scheduleKey),['daily-08-18']);
  assert.deepEqual(morning[0].reports,DIRECTOR_REPORT_TITLES.slice(0,4));
  const evening=reportsDueForDesignation('projectManager',new Date('2026-09-01T13:35:00Z'));
  assert.deepEqual(evening.map((group)=>group.scheduleKey),['daily-19']);
  assert.deepEqual(evening[0].reports,DIRECTOR_REPORT_TITLES.slice(6,13));
});

test('department managers use every-event rules separately from scheduled consolidated reports',()=>{
  const production=flowDesignationForUser({managerRole:'Production Manager'},{permissions:{managerRoles:['Production Manager']}});
  assert.equal(production.key,'productionManager');
  const due=reportsDueForDesignation(production.key,new Date('2026-09-01T13:35:00Z'));
  assert.equal(due.length,1);
  assert.deepEqual(due[0].reports,DIRECTOR_REPORT_TITLES.slice(6,13));
  const supervisor=flowDesignationForUser({designation:'Production Incharge / Supervisor'});
  assert.equal(supervisor.key,'productionSupervisor');
  assert.equal(reportsDueForDesignation(supervisor.key,new Date('2026-09-01T13:35:00Z')).length,0);
});

test('OEM designations follow their day-cycle consolidate schedules',()=>{
  const area=flowDesignationForUser({designation:'Area Service engineer'});
  assert.equal(area.key,'oemAreaServiceEngineer');
  const due=reportsDueForDesignation(area.key,new Date('2026-09-03T13:35:00Z'));
  assert.equal(due.length,1);
  assert.deepEqual(due[0].reports,[DIRECTOR_REPORT_TITLES[1]]);
  assert.equal(reportsDueForDesignation(area.key,new Date('2026-09-04T13:35:00Z')).length,0);
});

test('hierarchy report scheduler is wired into the server',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(server,/flowDesignationForUser/);
  assert.match(server,/reportsDueForDesignation/);
  assert.match(server,/sendScheduledHierarchyReportBundles/);
  assert.match(server,/HIERARCHY-\$\{designation\.key\}-\$\{scheduleKey\}/);
  assert.match(server,/Director schedule is handled by the hierarchy report flow/);
});
