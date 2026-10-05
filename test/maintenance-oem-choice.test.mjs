import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterOemDelayedRows} from '../src/oem-delay-filter.mjs';

test('unsaved responsibility can be switched; saved responsibility stays locked in the general edit form', () => {
  const ui=readFileSync(new URL('../src/maintenance-oem-choice.jsx',import.meta.url),'utf8');
  assert.ok(ui.includes('disabled={Boolean(request.oemResponsibility) && !canEdit}'));
  assert.ok(ui.includes('setSelected(value)'));
  assert.ok(ui.includes('type="hidden" name="oemResponsibility" value={selected}'));
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.ok(server.includes('SELECT site,complaint,oem_responsibility AS "oemResponsibility"'));
  assert.ok(server.includes('before.oemResponsibility&&before.oemResponsibility!==oemResponsibility'));
  assert.ok(server.includes('eligible.rows[0].oemResponsibility&&eligible.rows[0].oemResponsibility!==oemResponsibility'));
});

test('explicit responsibility overrides legacy reasons without including closed vehicles', () => {
  const requests = [
    {ref:'oem',status:'Accepted',oemResponsibility:'OEM',delayedReason:'Parts CMLL'},
    {ref:'non',status:'Accepted',oemResponsibility:'NON OEM',delayedReason:'Parts OEM'},
    {ref:'legacy',status:'Accepted',delayedReason:'Tools OEM'},
    {ref:'closed',status:'Closed',oemResponsibility:'OEM'},
  ];
  assert.deepEqual(filterOemDelayedRows([{requests}])[0].requests.map(r=>r.ref), ['oem','legacy']);
});
test('selection is exclusive, stays in the edit form and does not open daily updates', () => {
  const source=readFileSync(new URL('../src/maintenance-oem-choice.jsx',import.meta.url),'utf8');
  assert.ok(source.includes('if (!request.acceptedAt) return null'));
  assert.ok(source.includes('checked={selected === value}'));
  assert.ok(source.includes('name="oemResponsibility"'));
  assert.doesNotMatch(source,/DailyRemarkForm|createPortal|onSave/);
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.ok(main.includes('oemResponsibility: form.get("oemResponsibility")'));
});

test('edit saves responsibility atomically without changing request status', () => {
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const route=source.slice(source.indexOf("app.patch('/api/requests/:reference',"),source.indexOf("app.patch('/api/requests/:reference/close',"));
  assert.ok(route.includes("!['OEM','NON OEM'].includes(oemResponsibility)"));
  assert.ok(route.includes('oemResponsibility!==undefined&&!before.acceptedAt'));
  assert.ok(route.includes('oem_responsibility=COALESCE($14::text,oem_responsibility)'));
  assert.ok(route.includes('revisingEtc,oemResponsibility??null'));
  assert.doesNotMatch(route,/SET status=|status=\$/);
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
