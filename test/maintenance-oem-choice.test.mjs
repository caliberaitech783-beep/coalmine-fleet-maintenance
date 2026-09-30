import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterOemDelayedRows} from '../src/oem-delay-filter.mjs';

test('explicit responsibility overrides legacy reasons without including closed vehicles', () => {
  const requests = [
    {ref:'oem',status:'Accepted',oemResponsibility:'OEM',delayedReason:'Parts CMLL'},
    {ref:'non',status:'Accepted',oemResponsibility:'NON OEM',delayedReason:'Parts OEM'},
    {ref:'legacy',status:'Accepted',delayedReason:'Tools OEM'},
    {ref:'closed',status:'Closed',oemResponsibility:'OEM'},
  ];
  assert.deepEqual(filterOemDelayedRows([{requests}])[0].requests.map(r=>r.ref), ['oem','legacy']);
});
test('selection waits for a successful daily update; cancellation does not persist it', () => {
  const source=readFileSync(new URL('../src/maintenance-oem-choice.jsx',import.meta.url),'utf8');
  assert.match(source,/if \(!request.acceptedAt \|\| !onSave\) return null/);
  assert.match(source,/checked=\{\(pending \|\| saved\) === value\}/);
  assert.match(source,/await onSave\(request.ref, \{\.\.\.payload, oemResponsibility: pending\}\); setSaved\(pending\)/);
  assert.match(source,/if \(!saveLock.current\) setPending\(null\)/);
});
test('server persists responsibility with the guarded daily update and exposes it to dashboards', () => {
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(source,/ADD COLUMN IF NOT EXISTS oem_responsibility/);
  assert.match(source,/oem_responsibility AS "oemResponsibility"/);
  const route=source.slice(source.indexOf("app.post('/api/requests/:reference/daily-remarks'"),source.indexOf("app.patch('/api/requests/:reference/arrival-flag'"));
  assert.match(route,/!\['OEM','NON OEM'\].includes\(oemResponsibility\)/);
  assert.match(route,/!eligible.rows\[0\].acceptedAt/);
  assert.match(route,/withMaintenanceArrivalGuard[\s\S]*UPDATE maintenance_requests SET oem_responsibility=\$1[\s\S]*return \{eligible,updatedToday\}/);
});
