import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const slice = server.slice(server.indexOf("const LOG_RETENTION_SETTING_KEY="), server.indexOf("app.get('/api/log-retention'"));

// Run the real settings reader and daily job against a recording fake database.
function harness(stored, {lastRunDate = ''} = {}) {
  const statements = [];
  const pool = {
    async query(sql, values = []) {
      if (sql.startsWith('SELECT setting_value')) return {rows: [{setting_value: stored, updated_at: null}]};
      if (sql.startsWith('SELECT value,updated_at FROM app_metadata')) return {rows: lastRunDate ? [{value: lastRunDate, updated_at: null}] : []};
      statements.push({sql: sql.replace(/\s+/g, ' ').trim(), values});
      return {rowCount: 3, rows: []};
    },
  };
  const api = new Function('pool', 'AUDIT_PURGE_MAX_DAYS', 'auditIndiaDateKey',
    `${slice};return {storedLogRetention,runLogRetention,LOG_RETENTION_KEYS};`)(pool, 3650, () => '2026-09-22');
  return {...api, statements};
}

const now = new Date('2026-09-22T06:30:00Z');
const daysBefore = (days) => new Date(now.getTime() - days * 86400000).toISOString();

test('a setting saved before this release keeps its meaning: audit only, nothing else deleted', async () => {
  const {runLogRetention, statements} = harness({auditDays: 5, activityDays: 0});
  const result = await runLogRetention(now);
  assert.equal(result.auditDeleted, 3);
  assert.deepEqual(statements.map(({sql}) => sql.split(' WHERE')[0]).filter((sql) => !sql.startsWith('INSERT')),
    ['DELETE FROM audit_events']);
  for (const key of ['whatsappHistoryDeleted', 'notificationsDeleted', 'sessionMessagesDeleted', 'requestMediaCleared']) assert.equal(result[key], 0, key);
});

test('everything off means the job does nothing at all', async () => {
  const {runLogRetention, statements} = harness({auditDays: 0, activityDays: 0, whatsappDays: 0, notificationDays: 0, mediaDays: 0});
  assert.deepEqual(await runLogRetention(now), {skipped: true, reason: 'automatic clean-up is off'});
  assert.equal(statements.length, 0);
});

test('each part deletes only what is older than its own number of days', async () => {
  const {runLogRetention, statements} = harness({auditDays: 5, activityDays: 30, whatsappDays: 90, notificationDays: 60, mediaDays: 365});
  const result = await runLogRetention(now);
  const find = (prefix) => statements.find(({sql}) => sql.startsWith(prefix));

  assert.deepEqual(find('DELETE FROM whatsapp_alert_history').values, [daysBefore(90)]);
  assert.deepEqual(find('DELETE FROM crm_notifications').values, [daysBefore(60)]);
  assert.deepEqual(find('DELETE FROM session_messages').values, [daysBefore(60)]);
  assert.match(find('DELETE FROM session_messages').sql, /dismissed_at IS NOT NULL/);

  const media = find('UPDATE maintenance_requests');
  assert.deepEqual(media.values, [daysBefore(365)]);
  assert.match(media.sql, /WHERE verified_at IS NOT NULL AND verified_at<\$1/, 'only requests MIS has verified');
  assert.ok(!statements.some(({sql}) => sql.startsWith('DELETE FROM maintenance_requests')), 'no request is ever deleted');

  assert.equal(result.whatsappHistoryDeleted, 3);
  assert.equal(result.notificationsDeleted, 3);
  assert.equal(result.sessionMessagesDeleted, 3);
  assert.equal(result.requestMediaCleared, 3);
});

test('the job runs once per India day', async () => {
  const {runLogRetention, statements} = harness({auditDays: 5, whatsappDays: 90}, {lastRunDate: '2026-09-22'});
  assert.deepEqual(await runLogRetention(now), {skipped: true, reason: 'already ran today'});
  assert.equal(statements.length, 0);
});

test('stored values outside 0 to 3650 fall back to the safe default', async () => {
  const {storedLogRetention} = harness({auditDays: 5, whatsappDays: -4, notificationDays: 'lots', mediaDays: 99999});
  const retention = await storedLogRetention();
  assert.equal(retention.whatsappDays, 0);
  assert.equal(retention.notificationDays, 0);
  assert.equal(retention.mediaDays, 0, 'an unreadable media setting must never switch media removal on');
});
