import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformWithOxc} from 'vite';

const source = readFileSync(new URL('../src/maintenance-etc-input.jsx', import.meta.url), 'utf8');
const compiled = await transformWithOxc(source.replace(/^import .*;$/gm, '').replace(/export default /g, '').replace(/export /g, ''), 'maintenance-etc-input.jsx', {jsx:{runtime:'classic'}});
const {etcParts, etcValue} = new Function(`${compiled.code};return {etcParts,etcValue};`)();

test('ETC 12-hour display preserves every stored hour and minute', () => {
  for (let hour=0;hour<24;hour++) for (const minute of ['00','30','59']) {
    const value=`2026-11-10T${String(hour).padStart(2,'0')}:${minute}`;
    assert.equal(etcValue(etcParts(value)), value);
  }
  assert.deepEqual(etcParts('2026-11-10T14:56'), {date:'2026-11-10',hour:'02',minute:'56',period:'PM'});
  assert.equal(etcParts('2026-11-10T00:00').period, 'AM');
  assert.equal(etcParts('2026-11-10T12:00').period, 'PM');
});
test('ETC remains required and submits the existing field name without incomplete times', () => {
  assert.equal(etcValue(etcParts('')), '');
  for (const key of ['date','hour','minute','period']) assert.equal(etcValue({...etcParts('2026-11-10T14:56'),[key]:''}), '');
  assert.match(source, /type="hidden" name="expectedCompletionAt"/);
  assert.equal((source.match(/required value=/g)||[]).length, 4);
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(main, /<MaintenanceEtcInput value=\{expectedCompletionAt\} onChange=\{setExpectedCompletionAt\}/);
  assert.match(main, /expectedCompletionAt: form.get\("expectedCompletionAt"\)/);
});
