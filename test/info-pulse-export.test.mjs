import assert from 'node:assert/strict';
import test from 'node:test';
import {buildInfoPulseBreakdowns} from '../info-pulse-data.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';
import {pulseBreakdownRows} from '../src/info-pulse-timing.mjs';
import {pulseExportColumns} from '../src/info-pulse-export.mjs';
import {printColumnOptions} from '../src/smart-print.mjs';

const NOW = Date.parse('2026-09-16T11:00:00+05:30');
const LABELS = ['Site', 'Equipment / Vehicle', 'Equipment group', 'Request ref', 'Status', 'Standing tier', 'Breakdown reason', 'Delay reason', 'Delay reason recorded', 'Standing since', 'Down for', 'ETC', 'ETC status', 'Daily updates', 'Latest daily update'];
const stamp = value => formatDisplayDateTime(value);
const rowsOf = requests => pulseBreakdownRows(buildInfoPulseBreakdowns(requests), NOW);
const cells = row => Object.fromEntries(pulseExportColumns(NOW).map(column => [column.label, column.value(row)]));

test('every figure of a ranked breakdown row exports as text, in reading order, and Smart Print can list the columns', () => {
  const [dozer] = rowsOf([{ref: 'REQ-D38', door: 'D38', reg: 'MH34AB1234', site: 'Majri OB', equipmentGroup: 'DOZERS', status: 'Open', start: '2026-09-14 08:01', expectedCompletionAt: '2026-09-16 09:00', complaint: ' LHS track chain loose ', dailyRemarks: [
    {createdAt: '2026-09-14 18:00', authorName: 'Site team', remark: 'Chain inspected', delayReason: 'Vendor inspection pending'},
    {createdAt: '2026-09-15 18:30', authorName: 'Maintenance team', remark: 'Battery replaced', delayReason: 'Awaiting track chain from supplier'},
  ]}]);
  assert.deepEqual(Object.keys(cells(dozer)), LABELS);
  assert.deepEqual(cells(dozer), {
    Site: 'Majri OB', 'Equipment / Vehicle': 'D38', 'Equipment group': 'DOZERS', 'Request ref': 'REQ-D38', Status: 'Open', 'Standing tier': 'Critical · 24h+',
    'Breakdown reason': 'LHS track chain loose', 'Delay reason': 'Awaiting track chain from supplier', 'Delay reason recorded': `${stamp('2026-09-15 18:30')} · Maintenance team`,
    'Standing since': stamp('2026-09-14 08:01'), 'Down for': '2d 2h 59m', ETC: stamp('2026-09-16 09:00'), 'ETC status': 'Overdue by 2h 0m',
    'Daily updates': '2', 'Latest daily update': `${stamp('2026-09-15 18:30')} · Maintenance team · Battery replaced · Delayed reason: Awaiting track chain from supplier`,
  });
  assert.ok(pulseExportColumns(NOW).every(column => typeof column.value(dozer) === 'string'));
  assert.deepEqual(printColumnOptions(pulseExportColumns(NOW)).map(option => option.label), LABELS);
});

test('the overdue and closure reasons keep their label, the ETC reads due in or not set, and fallbacks mirror the list', () => {
  const [eicher, volvo, odd] = rowsOf([
    {ref: 'REQ-W1', door: 'W1', site: 'Majri OB', status: 'Open', start: '2026-09-15 20:00', complaint: 'Gear box noise', overdueReason: 'Gear box sent to workshop', dailyRemarks: [{createdAt: '2026-09-16 08:00', remark: 'Opened gear box', delayReason: 'Spares not in stock'}]},
    {ref: 'REQ-V167', reg: 'MH34BZ3284', site: 'Dhoptala OB (2nd)', equipment: 'Volvo tipper', status: 'Open', acceptedAt: '2026-09-16 06:30', start: '2026-09-16 06:02', expectedCompletionAt: '2026-09-16 13:30', complaint: 'Leaf spring broken', delayedReason: 'Waiting for MIS closure'},
    {ref: 'REQ-ODD', door: 'O1', site: 'Sasti OB', status: 'Open', start: '2026-09-16 10:30', expectedCompletionAt: 'soon', complaint: 'Compressor fault'},
  ]);
  const w1 = cells(eicher), v167 = cells(volvo), o1 = cells(odd);
  assert.equal(w1['Standing tier'], 'Warning · 12h+');
  assert.equal(w1['Delay reason'], 'Overdue reason: Gear box sent to workshop');
  assert.equal(w1['Delay reason recorded'], '');
  assert.deepEqual([w1.ETC, w1['ETC status'], w1['Daily updates']], ['Not set', 'Not set', '1']);
  assert.equal(w1['Latest daily update'], `${stamp('2026-09-16 08:00')} · Opened gear box · Delayed reason: Spares not in stock`);
  assert.deepEqual([v167['Equipment / Vehicle'], v167['Equipment group'], v167.Status, v167['Standing tier']], ['MH34BZ3284', 'Volvo tipper', 'Accepted', 'Under 12h']);
  assert.equal(v167['Delay reason'], 'Closure delay reason: Waiting for MIS closure');
  assert.deepEqual([v167['Down for'], v167.ETC, v167['ETC status']], ['4h 58m', stamp('2026-09-16 13:30'), 'Due in 2h 30m']);
  assert.deepEqual([o1['Standing tier'], o1.ETC, o1['ETC status'], o1['Daily updates'], o1['Latest daily update']], ['Under 12h', 'Not recorded', 'Not recorded', '0', '']);
});

test('a request with nothing but a reference exports the list placeholders and blanks, never a crash', () => {
  const [bare] = rowsOf([{ref: 'REQ-BARE', site: 'Sasti OB', status: 'Open', start: 'not a date'}]);
  assert.deepEqual(cells(bare), {
    Site: 'Sasti OB', 'Equipment / Vehicle': 'Not recorded', 'Equipment group': '', 'Request ref': 'REQ-BARE', Status: 'Open', 'Standing tier': 'Under 12h',
    'Breakdown reason': 'Not recorded', 'Delay reason': '', 'Delay reason recorded': '', 'Standing since': 'Not recorded', 'Down for': 'Not recorded',
    ETC: 'Not set', 'ETC status': 'Not set', 'Daily updates': '0', 'Latest daily update': '',
  });
});
