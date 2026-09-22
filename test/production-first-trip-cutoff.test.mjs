import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('production first trip API follows the MIS pending queue lifecycle', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const route = server.slice(server.indexOf("app.patch('/api/requests/:reference/production-first-trip'"), server.indexOf("app.patch('/api/requests/:reference/verify'"));
  assert.doesNotMatch(route, /productionFirstTripCutoffMs/);
  assert.match(route, /MIS verification is completed/);
  assert.match(route, /Production first trip can be recorded only after Maintenance makes the vehicle on road\./);
});
