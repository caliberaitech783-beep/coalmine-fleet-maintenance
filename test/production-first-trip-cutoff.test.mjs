import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRODUCTION_FIRST_TRIP_ROLLOUT_IST, PRODUCTION_FIRST_TRIP_ROLLOUT_LABEL, isProductionFirstTripPending, isProductionFirstTripRequired, productionFirstTripCutoffMs} from '../info-pulse-data.mjs';

const istLabel = (ms) => new Date(ms + 330 * 60_000).toISOString().slice(0, 19);

test('production first trip API stays open after MIS verification', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const route = server.slice(server.indexOf("app.patch('/api/requests/:reference/production-first-trip'"), server.indexOf("app.patch('/api/requests/:reference/verify'"));
  assert.equal(istLabel(productionFirstTripCutoffMs()), '2026-09-22T00:00:00');
  assert.match(route, /isProductionFirstTripRequired\(request\)/);
  assert.doesNotMatch(route, /MIS verification is completed/);
  assert.doesNotMatch(route, /request\.verified_at\|\|/);
  assert.match(route, /Production first trip can be recorded only after Maintenance makes the vehicle on road\./);
  assert.match(route, /Production first-trip entry is available only for requests generated on or after \$\{PRODUCTION_FIRST_TRIP_ROLLOUT_LABEL\}\./);
});

test('the rollout cutoff is a fixed date, so it never rolls forward with the clock', () => {
  assert.equal(PRODUCTION_FIRST_TRIP_ROLLOUT_IST, '2026-09-22 00:00:00');
  assert.equal(PRODUCTION_FIRST_TRIP_ROLLOUT_LABEL, '22-09-2026');
  const cutoff = productionFirstTripCutoffMs();
  for (const clock of ['2026-09-22T00:05:00+05:30', '2026-09-23T09:00:00+05:30', '2027-01-04T09:00:00+05:30']) {
    assert.equal(productionFirstTripCutoffMs(Date.parse(clock)), cutoff, `cutoff must not move on ${clock}`);
  }
});

test('requests generated before rollout stay out even if Maintenance makes them on road today', () => {
  const onRoad = (ref, start, closedAt) => ({ref, start, status: 'Closed', closedAt, productionFirstTripAt: ''});
  const backlog = onRoad('before-rollout', '2026-09-21 23:59', '2026-09-22 09:00');
  const today = onRoad('rollout-day', '2026-09-22 08:00', '2026-09-22 18:30');
  const later = onRoad('after-rollout', '2026-09-25 06:00', '2026-09-25 07:15');
  assert.equal(isProductionFirstTripRequired(backlog), false);
  assert.equal(isProductionFirstTripPending(backlog), false, 'requests generated before rollout are history');
  assert.equal(isProductionFirstTripPending(today), true);
  assert.equal(isProductionFirstTripPending(later), true);
  // The same rows a week later: an evening entry must still be waiting the next morning.
  assert.equal(isProductionFirstTripPending(today, {now: Date.parse('2026-09-29T09:00:00+05:30')}), true);
  assert.equal(isProductionFirstTripPending(backlog, {now: Date.parse('2026-09-29T09:00:00+05:30')}), false);
});
