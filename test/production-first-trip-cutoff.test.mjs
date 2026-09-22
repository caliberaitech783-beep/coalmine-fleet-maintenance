import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productionFirstTripCutoffMs} from '../info-pulse-data.mjs';

test('production first trip cutoff starts at yesterday 00:00 IST', () => {
  const cutoff = productionFirstTripCutoffMs(Date.parse('2026-09-22T13:00:00+05:30'));
  assert.equal(new Date(cutoff + 330 * 60_000).toISOString().slice(0, 19), '2026-09-21T00:00:00');
});

test('production first trip API rejects requests closed before the cutoff', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const route = server.slice(server.indexOf("app.patch('/api/requests/:reference/production-first-trip'"), server.indexOf("app.patch('/api/requests/:reference/verify'"));
  assert.match(route, /productionFirstTripCutoffMs\(\)/);
  assert.match(route, /Production first-trip entry is available only for vehicles\/equipment made on road from yesterday onward\./);
});
