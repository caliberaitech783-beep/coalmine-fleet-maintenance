import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {auditLogExportDue,auditLogExportSlot,buildAuditLogExportEmail} from '../audit-log-export.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('Audit Trail export becomes due at 5 PM IST after five calendar days',()=>{
  const before=new Date('2026-09-11T11:29:59Z');
  const atFive=new Date('2026-09-11T11:30:00Z');
  assert.equal(auditLogExportDue(before,null),false);
  assert.equal(auditLogExportDue(atFive,null),true);
  assert.equal(auditLogExportDue(atFive,new Date('2026-09-07T11:30:00Z')),false);
  assert.equal(auditLogExportDue(atFive,new Date('2026-09-06T11:30:00Z')),true);
  assert.equal(auditLogExportSlot(atFive),'2026-09-11-1700-IST');
});

test('scheduled Audit Trail export publishes a protected Excel hyperlink to administrators',()=>{
  const email=buildAuditLogExportEmail({url:'https://bdms.cmll.in/r/example',generatedAt:new Date('2026-09-11T11:30:00Z'),rowCount:43});
  assert.match(email.subject,/Five-day Audit Trail export/);
  assert.match(email.text,/43/);
  assert.match(email.html,/https:\/\/bdms\.cmll\.in\/r\/example/);
  assert.match(server,/CREATE TABLE IF NOT EXISTS audit_log_export_runs/);
  assert.match(server,/CREATE TABLE IF NOT EXISTS audit_log_export_deliveries/);
  assert.match(server,/sendScheduledAuditLogExports/);
  assert.match(server,/NOW\(\)\+INTERVAL '30 days'/);
  assert.match(server,/\['Admin','Super Admin'\]\.includes/);
  assert.match(server,/sendAuditLogExportEmail/);
  assert.match(server,/templateKey:'consolidatedRequestReport',purpose:'consolidatedRequestReport'/);
});
