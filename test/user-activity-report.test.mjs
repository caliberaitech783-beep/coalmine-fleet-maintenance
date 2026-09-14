import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildUserActivitySummary,totalUserWorkedMinutes} from '../user-activity-report.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('user activity report totals sessions, actions, outcomes and active time',()=>{
  const rows=buildUserActivitySummary([
    {actorLogin:'anoop',actorName:'Anoop Paul',actorRole:'Admin',sessionId:'one',occurredAt:'2026-09-11T10:00:00Z',module:'Navigation',action:'Open page',outcome:'Success'},
    {actorLogin:'anoop',actorName:'Anoop Paul',actorRole:'Admin',sessionId:'one',occurredAt:'2026-09-11T10:05:00Z',module:'Reports',action:'Download Excel report',outcome:'Success'},
    {actorLogin:'anoop',actorName:'Anoop Paul',actorRole:'Admin',sessionId:'two',occurredAt:'2026-09-12T10:00:00Z',module:'Masters',action:'Edit record',outcome:'Failed'},
  ]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].sessionCount,2);
  assert.equal(rows[0].totalActivityCount,3);
  assert.equal(rows[0].successfulCount,2);
  assert.equal(rows[0].failedCount,1);
  assert.equal(rows[0].totalWorkedTime,'00:05:00');
  assert.equal(totalUserWorkedMinutes(rows),5);
});

test('persisted session-time ledger takes precedence over event-gap estimates',()=>{
  const rows=buildUserActivitySummary([
    {actorLogin:'operator',actorName:'Operator',sessionId:'session-1',occurredAt:'2026-09-11T10:00:00Z',action:'Open page',outcome:'Success'},
  ],{sessions:[{sessionId:'session-1',actorLogin:'operator',actorName:'Operator',activeSeconds:3723}]});
  assert.equal(rows[0].totalWorkedTime,'01:02:03');
  assert.equal(rows[0].totalWorkedMinutes,62.05);
});

test('application records page, export, cloud runtime and scheduled process activity',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS user_session_activity/);
  assert.match(server,/touchUserSessionActivity/);
  assert.match(server,/runAuditedBackendProcess/);
  assert.match(server,/module:'Cloud deployment',action:'Start application runtime'/);
  assert.match(server,/app\.post\('\/api\/user-activity',requireSession/);
  assert.match(client,/recordUserActivity\(\{module:"Navigation",action:"Open page",targetReference:active\}\)/);
  assert.match(client,/action:"Download Excel report"/);
  assert.match(client,/action:"Download PDF report"/);
  assert.match(client,/action:"Print report"/);
});
