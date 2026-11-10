import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackgroundJobQueue} from '../background-job-queue.mjs';

test('scheduled jobs share two slots and a busy timer cannot queue duplicates', async () => {
  const failures = [];
  const enqueue = createBackgroundJobQueue({concurrency:2, onError:error=>failures.push(error.message)});
  const active = [];
  let release, fail;
  const backup = () => {
    active.push('backup');
    return new Promise(resolve=>{release=resolve;});
  };
  const report = () => {
    active.push('report');
    return new Promise((_, reject)=>{fail=reject;});
  };
  const pending = () => { active.push('pending'); };
  const flush = () => new Promise(resolve=>setImmediate(resolve));

  enqueue(backup);
  enqueue(report);
  enqueue(pending);
  enqueue(backup);
  enqueue(pending);
  await flush();
  assert.deepEqual(active,['backup','report']);
  fail(new Error('Delivery failed'));
  await flush();
  assert.deepEqual(active,['backup','report','pending']);
  assert.deepEqual(failures,['Delivery failed']);
  release();
  await flush();
  enqueue(backup);
  await flush();
  assert.deepEqual(active,['backup','report','pending','backup']);
  release();
});
