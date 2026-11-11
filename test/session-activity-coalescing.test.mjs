import assert from 'node:assert/strict';
import test from 'node:test';
import {coalesceSessionActivity} from '../session-activity-coalescing.mjs';

test('dashboard fan-out and save share one activity write without blocking other sessions', async () => {
  let now = 0;
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const calls = [];
  const record = coalesceSessionActivity({now: () => now});
  const wave = Array.from({length: 20}, () => record('dashboard', () => {
    calls.push('dashboard');
    return blocked;
  }));
  await record('another-user', () => calls.push('another-user'));
  assert.deepEqual(calls, ['dashboard', 'another-user']);
  release();
  await Promise.all(wave);
  now = 4_999;
  await record('dashboard', () => assert.fail('activity write repeated within the window'));
  now = 5_000;
  await record('dashboard', () => calls.push('dashboard'));
  assert.deepEqual(calls, ['dashboard', 'another-user', 'dashboard']);
});

test('failed activity write can be retried immediately', async () => {
  const record = coalesceSessionActivity({now: () => 0});
  await assert.rejects(record('session', () => {throw Error('temporary failure');}), /temporary failure/);
  let wrote = false;
  await record('session', () => {wrote = true;});
  assert.equal(wrote, true);
});
