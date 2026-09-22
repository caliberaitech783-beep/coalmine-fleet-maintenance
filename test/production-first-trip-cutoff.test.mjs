import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productionFirstTripCutoffMs} from '../info-pulse-data.mjs';

test('production first trip API follows the MIS pending queue lifecycle', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const route = server.slice(server.indexOf("app.patch('/api/requests/:reference/production-first-trip'"), server.indexOf("app.patch('/api/requests/:reference/verify'"));
  assert.equal(new Date(productionFirstTripCutoffMs() + 330 * 60_000).toISOString().slice(0, 19), '2026-09-21T00:00:00');
  assert.match(route, /productionFirstTripCutoffMs\(\)/);
  assert.match(route, /MIS verification is completed/);
  assert.match(route, /Production first trip can be recorded only after Maintenance makes the vehicle on road\./);
  assert.match(route, /Production first-trip entry is available only for requests made on road from 21-09-2026 onward\./);
});
