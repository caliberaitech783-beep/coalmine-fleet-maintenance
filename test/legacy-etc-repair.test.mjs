import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {legacyEtcRepairPlan,legacyEtcRepairReason} from '../legacy-etc-repair.mjs';

const iso = value => value?.toISOString();

test('repairs provable same-day AM/PM inversions without changing the clock time', () => {
  const plan = legacyEtcRepairPlan('2026-09-15T09:30:53+05:30', '2026-09-15T04:04:00+05:30');
  assert.equal(plan.strategy, 'am-pm-inversion');
  assert.equal(iso(plan.after), '2026-09-15T10:34:00.000Z');
  assert.match(legacyEtcRepairReason(plan.strategy), /AM to PM/);
});

test('moves an ambiguous backdate to the first full minute after breakdown', () => {
  const plan = legacyEtcRepairPlan('2026-09-15T14:26:26+05:30', '2026-09-15T14:00:00+05:30');
  assert.equal(plan.strategy, 'first-valid-minute');
  assert.equal(iso(plan.after), '2026-09-15T08:57:00.000Z');
});

test('moves same-minute second precision errors to the following minute', () => {
  const plan = legacyEtcRepairPlan('2026-09-15T15:05:13+05:30', '2026-09-15T15:05:00+05:30');
  assert.equal(plan.strategy, 'first-valid-minute');
  assert.equal(iso(plan.after), '2026-09-15T09:36:00.000Z');
});

test('does not alter valid, missing or malformed ETC values', () => {
  assert.equal(legacyEtcRepairPlan('2026-09-15T14:26:26+05:30', '2026-09-15T14:27:00+05:30'), null);
  assert.equal(legacyEtcRepairPlan('2026-09-15T14:26:26+05:30', ''), null);
  assert.equal(legacyEtcRepairPlan('invalid', '2026-09-15T14:00:00+05:30'), null);
});

test('startup cleanup is one-time, row-locked and writes request timeline audit records', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /legacy_etc_backdates_repaired_v1/);
  assert.match(server, /expected_completion_at IS NOT NULL AND expected_completion_at<=started_at[\s\S]*FOR UPDATE/);
  assert.match(server, /legacyEtcRepairPlan\(row\.started_at,row\.expected_completion_at\)/);
  assert.match(server, /'Workflow timeline','Success','system','System migration'/);
  assert.match(server, /ON CONFLICT \(key\) DO NOTHING/);
});
