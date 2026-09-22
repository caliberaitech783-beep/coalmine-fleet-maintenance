import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRODUCTION_FIRST_TRIP_ROLLOUT_IST, PRODUCTION_FIRST_TRIP_ROLLOUT_LABEL, isProductionFirstTripPending, productionFirstTripCutoffMs} from '../info-pulse-data.mjs';

const istLabel = (ms) => new Date(ms + 330 * 60_000).toISOString().slice(0, 19);

test('production first trip API follows the MIS pending queue lifecycle', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const route = server.slice(server.indexOf("app.patch('/api/requests/:reference/production-first-trip'"), server.indexOf("app.patch('/api/requests/:reference/verify'"));
  assert.equal(istLabel(productionFirstTripCutoffMs()), '2026-09-22T00:00:00');
  assert.match(route, /productionFirstTripCutoffMs\(\)/);
  assert.match(route, /MIS verification is completed/);
  assert.match(route, /Production first trip can be recorded only after Maintenance makes the vehicle on road\./);
  assert.match(route, /Production first-trip entry is available only for vehicles made on road on or after \$\{PRODUCTION_FIRST_TRIP_ROLLOUT_LABEL\}\./);
});

test('the rollout cutoff is a fixed date, so it never rolls forward with the clock', () => {
  assert.equal(PRODUCTION_FIRST_TRIP_ROLLOUT_IST, '2026-09-22 00:00:00');
  assert.equal(PRODUCTION_FIRST_TRIP_ROLLOUT_LABEL, '22-09-2026');
  const cutoff = productionFirstTripCutoffMs();
  for (const clock of ['2026-09-22T00:05:00+05:30', '2026-09-23T09:00:00+05:30', '2027-01-04T09:00:00+05:30']) {
    assert.equal(productionFirstTripCutoffMs(Date.parse(clock)), cutoff, `cutoff must not move on ${clock}`);
  }
});

test('yesterday stays out of the queue and today stays in it after midnight', () => {
  const onRoad = (ref, closedAt) => ({ref, status: 'Closed', closedAt, productionFirstTripAt: ''});
  const backlog = onRoad('before-rollout', '2026-09-21 23:59');
  const today = onRoad('rollout-day', '2026-09-22 18:30');
  const later = onRoad('after-rollout', '2026-09-25 07:15');
  assert.equal(isProductionFirstTripPending(backlog), false, 'work made on road before the rollout is history');
  assert.equal(isProductionFirstTripPending(today), true);
  assert.equal(isProductionFirstTripPending(later), true);
  // The same rows a week later: an evening entry must still be waiting the next morning.
  assert.equal(isProductionFirstTripPending(today, {now: Date.parse('2026-09-29T09:00:00+05:30')}), true);
  assert.equal(isProductionFirstTripPending(backlog, {now: Date.parse('2026-09-29T09:00:00+05:30')}), false);
});
