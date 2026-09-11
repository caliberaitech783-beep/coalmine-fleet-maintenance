import assert from 'node:assert/strict';
import test from 'node:test';
import {INFO_PULSE_PROMPT_HOLD_MS, INFO_PULSE_PROMPT_INTERVAL_MS, claimInfoPulsePrompt, infoPulsePromptDecision, infoPulsePromptKey} from '../info-pulse-prompt.mjs';

const NOW = Date.parse('2026-09-11T11:00:00+05:30');
const HOUR = 60 * 60 * 1000;

test('the prompt opens on the first sign-in, again after four hours, and resumes inside the mandatory minute', () => {
  assert.equal(INFO_PULSE_PROMPT_INTERVAL_MS, 4 * HOUR);
  assert.equal(INFO_PULSE_PROMPT_HOLD_MS, 60000);
  assert.deepEqual(infoPulsePromptDecision(null, NOW), {show: true, claim: true, shownAt: NOW, closeAfterMs: 60000, nextAvailableAt: NOW + 4 * HOUR});
  assert.deepEqual(infoPulsePromptDecision(new Date(NOW - 20000), NOW), {show: true, claim: false, shownAt: NOW - 20000, closeAfterMs: 40000, nextAvailableAt: NOW - 20000 + 4 * HOUR});
  assert.deepEqual(infoPulsePromptDecision(new Date(NOW - 60000), NOW), {show: false, claim: false, shownAt: NOW - 60000, closeAfterMs: 0, nextAvailableAt: NOW - 60000 + 4 * HOUR});
  assert.equal(infoPulsePromptDecision(new Date(NOW - 4 * HOUR + 1), NOW).show, false);
  assert.equal(infoPulsePromptDecision(new Date(NOW - 4 * HOUR), NOW).claim, true);
  assert.equal(infoPulsePromptDecision(new Date(NOW - 26 * HOUR).toISOString(), NOW).claim, true);
  assert.equal(infoPulsePromptDecision('not a date', NOW).claim, true);
  assert.equal(infoPulsePromptDecision(new Date(NOW + HOUR), NOW).claim, true, 'a future record never blocks the prompt');
  assert.equal(infoPulsePromptKey({login: ' Ravi.K ', name: 'Ravi'}), 'ravi.k');
  assert.equal(infoPulsePromptKey({name: 'Ravi Kumar'}), 'ravi kumar');
});

test('claiming records the prompt per login and later sign-ins stay quiet until four hours pass', async () => {
  const store = new Map();
  const queries = [];
  const query = async (text, values) => {
    queries.push(text);
    if (text.startsWith('SELECT')) return {rows: store.has(values[0]) ? [{shown_at: store.get(values[0])}] : []};
    store.set(values[0], values[1]);
    return {rows: []};
  };
  assert.deepEqual(await claimInfoPulsePrompt(query, 'Ravi.K', NOW), {show: true, closeAfterMs: 60000, nextAvailableAt: NOW + 4 * HOUR});
  assert.deepEqual(store.get('ravi.k'), new Date(NOW));
  assert.match(queries[1], /INSERT INTO info_pulse_prompts.*ON CONFLICT \(login\) DO UPDATE/);
  assert.deepEqual(await claimInfoPulsePrompt(query, 'ravi.k', NOW + 30000), {show: true, closeAfterMs: 30000, nextAvailableAt: NOW + 4 * HOUR});
  assert.deepEqual(await claimInfoPulsePrompt(query, 'RAVI.K', NOW + 2 * HOUR), {show: false, closeAfterMs: 0, nextAvailableAt: NOW + 4 * HOUR});
  assert.deepEqual(store.get('ravi.k'), new Date(NOW), 'a refused prompt does not move the record');
  assert.equal((await claimInfoPulsePrompt(query, 'other', NOW + 2 * HOUR)).show, true, 'another user is tracked separately');
  assert.deepEqual(await claimInfoPulsePrompt(query, 'ravi.k', NOW + 4 * HOUR), {show: true, closeAfterMs: 60000, nextAvailableAt: NOW + 8 * HOUR});
  assert.deepEqual(store.get('ravi.k'), new Date(NOW + 4 * HOUR));
  assert.deepEqual(await claimInfoPulsePrompt(query, '', NOW), {show: false, closeAfterMs: 0, nextAvailableAt: 0});
});
