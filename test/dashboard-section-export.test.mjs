import assert from 'node:assert/strict';
import test from 'node:test';
import {reportPdfHeading} from '../report-refinements.mjs';
import {printColumnOptions} from '../src/smart-print.mjs';
import {breakdownTrendExport, dailyBdBalanceExport, fleetSectionExport, requestLifecycleExport, throughputSectionExport} from '../src/dashboard-section-export.mjs';

// Each exported cell as its column prints it; a figure the row does not carry is blank.
const cells = ({columns, rows}) => rows.map(row => columns.map(column => column.value(row) ?? ''));
const labels = ({columns}) => columns.map(column => column.label);
// The PDF heading appends every value of a Site or Location column; section exports must keep their own title.
function assertPlainExport(exported) {
  assert.equal(reportPdfHeading(exported.title, exported.rows, exported.columns), exported.title);
  for (const row of exported.rows) for (const column of exported.columns) {
    const value = column.value(row);
    assert.ok(value === undefined || typeof value === 'string' || typeof value === 'number', `${column.label} is plain text or a number`);
  }
  assert.deepEqual(printColumnOptions(exported.columns).map(option => option.label), labels(exported));
}

const REGIONS = [
  {code: 'WCL', equipment: 5, vehicles: 7, total: 12, breakdown: {equipment: 1, vehicles: 2, total: 3}, sites: [
    {name: 'Sasti OB', equipment: 2, vehicles: 4, total: 6, breakdown: {equipment: 1, vehicles: 0, total: 1}},
    {name: 'Majri OB', equipment: 3, vehicles: 3, total: 6, breakdown: {equipment: 0, vehicles: 2, total: 2}},
  ]},
  {code: 'NCL', equipment: 1, vehicles: 1, total: 2, breakdown: {equipment: 0, vehicles: 0, total: 0}, sites: [
    {name: 'Jayant OB', equipment: 1, vehicles: 1, total: 2, breakdown: {equipment: 0, vehicles: 0, total: 0}},
  ]},
];

test('Total Fleet exports every site bar, the region footers and the dashboard total, with a row for fleet on no chart site', () => {
  const totals = {equipment: 7, vehicles: 8, total: 15, breakdown: {equipment: 1, vehicles: 3, total: 4}};
  const exported = fleetSectionExport({mode: 'breakdown', place: 'All regions', regions: REGIONS, totals});
  assert.equal(exported.title, 'Total Fleet · All regions · Live fleet');
  assert.deepEqual(labels(exported), ['Region', 'Site name', 'Equipment', 'Vehicles', 'Total fleet', 'Equipment BD', 'Vehicle BD', 'BD balance', 'BD (%)']);
  assert.deepEqual(cells(exported), [
    ['WCL', 'Sasti OB', 2, 4, 6, 1, 0, 1, '16.7'],
    ['WCL', 'Majri OB', 3, 3, 6, 0, 2, 2, '33.3'],
    ['WCL', 'WCL total', 5, 7, 12, 1, 2, 3, '25.0'],
    ['NCL', 'Jayant OB', 1, 1, 2, 0, 0, 0, '0.0'],
    ['NCL', 'NCL total', 1, 1, 2, 0, 0, 0, '0.0'],
    ['Other', 'Location matches no chart site', 1, 0, 1, 0, 1, 1, '100.0'],
    ['Total', 'All sites', 7, 8, 15, 1, 3, 4, '26.7'],
  ]);
  assertPlainExport(exported);
  // When every asset sits on a chart site the columns add up without the extra row; Total mode exports the same table.
  const exact = fleetSectionExport({mode: 'total', place: 'WCL', regions: REGIONS, totals: {equipment: 6, vehicles: 8, total: 14, breakdown: {equipment: 1, vehicles: 2, total: 3}}});
  assert.equal(exact.title, 'Total Fleet · WCL · Live fleet');
  assert.deepEqual(exact.rows.map(row => row.name), ['Sasti OB', 'Majri OB', 'WCL total', 'Jayant OB', 'NCL total', 'All sites']);
  assert.equal(fleetSectionExport({place: 'WCL', regions: REGIONS, stale: true}).title, 'Total Fleet · WCL · Last checked data', 'reconnecting shows the last checked data');
});

test('OEM BD mode exports each site per OEM, site and region totals and the overall OEM BD count', () => {
  const oemChart = {rows: [1, 2, 3, 4, 5], sites: [
    {region: 'WCL', name: 'Sasti OB', total: 3, segments: [{label: 'BEML', rows: [1, 2]}, {label: 'Volvo', rows: [3]}]},
    {region: 'WCL', name: 'Majri OB', total: 0, segments: []},
    {region: 'NCL', name: 'Jayant OB', total: 1, segments: [{label: 'Volvo', rows: [4]}]},
    {region: 'Other sites', name: 'Old yard', total: 1, segments: [{label: 'Tata', rows: [5]}]},
  ]};
  const exported = fleetSectionExport({mode: 'oem', place: 'All regions', regions: REGIONS, oemChart, oemLabel: 'All OEMs', period: 'Current breakdowns'});
  assert.equal(exported.title, 'OEM BD · All regions · All OEMs · Current breakdowns');
  assert.deepEqual(labels(exported), ['Region', 'Site name', 'OEM', 'BD count', 'Share of OEM BD (%)']);
  assert.deepEqual(cells(exported), [
    ['WCL', 'Sasti OB', 'BEML', 2, '40.0'],
    ['WCL', 'Sasti OB', 'Volvo', 1, '20.0'],
    ['WCL', 'Sasti OB total', 'All OEMs', 3, '60.0'],
    ['WCL', 'Majri OB', 'No breakdowns', 0, '0.0'],
    ['WCL', 'WCL total', 'All OEMs', 3, '60.0'],
    ['NCL', 'Jayant OB', 'Volvo', 1, '20.0'],
    ['NCL', 'NCL total', 'All OEMs', 1, '20.0'],
    ['Other sites', 'Old yard', 'Tata', 1, '20.0'],
    ['Other sites', 'Other sites total', 'All OEMs', 1, '20.0'],
    ['Total', 'All sites', 'All OEMs', 5, '100.0'],
  ]);
  assertPlainExport(exported);
  assert.deepEqual(cells(fleetSectionExport({mode: 'oem', place: 'WCL', oemChart: {rows: [], sites: []}, oemLabel: 'Volvo', period: '01-09-2026 - 19-09-2026'})), [['Total', 'All sites', 'Volvo', 0, '0.0']]);
  assert.equal(fleetSectionExport({mode: 'oem', place: 'WCL', oemChart, oemLabel: 'Volvo', period: 'Current breakdowns', stale: true}).title, 'OEM BD · WCL · Volvo · Current breakdowns · Last checked data');
});

test('Daily BD balance exports each day and, over several days, the selected-period totals, with the chart change pill text', () => {
  const ledger = {excluded: [], days: [
    {date: '2026-09-18', open: 4, incoming: 2, outgoing: 1, balance: 5, idle: 0, delta: 1, percent: 25, direction: 'increase'},
    {date: '2026-09-19', open: 0, incoming: 3, outgoing: 0, balance: 3, idle: 1, delta: 3, percent: null, direction: 'increase'},
  ], totals: {open: 4, incoming: 5, outgoing: 1, balance: 3, idle: 1, delta: -1, percent: -25, direction: 'decrease'}};
  const exported = dailyBdBalanceExport({ledger, from: '2026-09-18', to: '2026-09-19', today: '2026-09-19', place: 'Sasti OB'});
  assert.equal(exported.title, 'Daily BD balance · Sasti OB · 18-09-2026 to 19-09-2026 · Today so far');
  assert.deepEqual(labels(exported), ['Date', 'Day', 'Opening BD', 'BD In', 'BD Out', 'Closing BD', 'Idle vehicles', 'Net change', 'Change (%)']);
  assert.deepEqual(cells(exported), [
    ['18-09-2026', 'Fri', 4, 2, 1, 5, 0, '+1', '+25.0%'],
    ['19-09-2026', 'Today · live', 0, 3, 0, 3, 1, '+3', '+3 from 0'],
    ['Selected period', '18-09-2026 to 19-09-2026', 4, 5, 1, 3, 1, '-1', '-25.0%'],
  ]);
  assertPlainExport(exported);
  const stale = dailyBdBalanceExport({ledger: {...ledger, days: ledger.days.slice(1)}, from: '2026-09-19', to: '2026-09-19', today: '2026-09-19', stale: true, place: 'All regions'});
  assert.equal(stale.title, 'Daily BD balance · All regions · 19-09-2026 to 19-09-2026 · Last checked data');
  assert.deepEqual(stale.rows.map(row => row.day), ['Today · last checked'], 'one day needs no period row');
  assert.equal(dailyBdBalanceExport({ledger: ledger, from: '2026-09-17', to: '2026-09-18', today: '2026-09-19'}).title, 'Daily BD balance · All regions · 17-09-2026 to 18-09-2026');
  assert.deepEqual(dailyBdBalanceExport({ledger: {days: [], totals: null, excluded: []}, from: '2026-09-19', to: '2026-09-19', today: '2026-09-19'}).rows, []);
});

test('Tracking Vehicle Throughput exports the open tab: site movement with availability, totals, summary cards and BD type mix, or the availability count', () => {
  const common = {place: 'WCL', period: '19-09-2026 to 19-09-2026', availabilityLabel: 'Availability: live · 19-09-2026', availabilityTotals: {total: 12, onRoad: 9, offRoad: 2, idle: 1, availability: 75}};
  const movement = throughputSectionExport({...common, tab: 'breakdown',
    sites: [{site: 'Sasti OB', open: 2, incoming: 1, outgoing: 1, balance: 2}, {site: 'Majri OB', open: 0, incoming: 0, outgoing: 0, balance: 0}],
    roadBySite: new Map([['Sasti OB', {total: 10, onRoad: 7, offRoad: 2, idle: 1, availability: 70}]]),
    movementTotals: {open: 2, incoming: 1, outgoing: 1, balance: 2}, openBalance: 1, idleRequests: 1,
    typeMix: [{label: 'Mechanical', count: 1, percentage: 50}, {label: 'Electrical', count: 1, percentage: 50}]});
  assert.equal(movement.title, 'Tracking Vehicle Throughput · Site-wise BD Movement · WCL · 19-09-2026 to 19-09-2026 · Availability: live · 19-09-2026');
  assert.deepEqual(labels(movement), ['Site name', 'BD Open', 'BD In', 'BD Out', 'BD Balance', 'Idle Vehicles', 'Availability count (%)', 'On road', 'Off road', 'Total fleet', 'Share of open BD balance (%)']);
  assert.deepEqual(cells(movement), [
    ['Sasti OB', 2, 1, 1, 2, 1, 80, 7, 2, 10, ''],
    ['Majri OB', 0, 0, 0, 0, 0, 0, 0, 0, 0, ''],
    ['All sites total', 2, 1, 1, 2, 1, 83, 9, 2, 12, ''],
    ['Summary · BD In (opening + new)', '', 3, '', '', '', '', '', '', '', ''],
    ['Summary · BD Out', '', '', 1, '', '', '', '', '', '', ''],
    ['Summary · BD Balance (open, excluding idle)', '', '', '', 1, '', '', '', '', '', ''],
    ['Summary · Idle Vehicles (idle requests)', '', '', '', '', 1, '', '', '', '', ''],
    ['BD Type Mix · Mechanical', '', '', '', 1, '', '', '', '', '', 50],
    ['BD Type Mix · Electrical', '', '', '', 1, '', '', '', '', '', 50],
  ]);
  assertPlainExport(movement);
  const availability = throughputSectionExport({...common, tab: 'road', availabilitySites: [
    {site: 'Sasti OB', total: 10, onRoad: 7, offRoad: 2, idle: 1, availability: 70},
    {site: 'Majri OB', total: 0, onRoad: 0, offRoad: 0, idle: 0, availability: 0},
  ]});
  assert.equal(availability.title, 'Tracking Vehicle Throughput · Availability Count · WCL · 19-09-2026 to 19-09-2026 · Availability: live · 19-09-2026');
  assert.deepEqual(cells(availability), [
    ['Sasti OB', 10, 7, 2, 1, 80, 'On road 70.0% · Off road 20.0% · Idle 10.0%'],
    ['Majri OB', 0, 0, 0, 0, 0, ''],
    ['All sites total', 12, 9, 2, 1, 83, 'On road 75.0% · Off road 16.7% · Idle 8.3%'],
  ]);
  assertPlainExport(availability);
});

test('Request Lifecycle exports the six grouped bars per day in chart order, Open in MIS from the day\'s MIS count, then the summary cards', () => {
  const readings = [
    {key: 'production', color: 'opened', label: 'Production Request', value: 5},
    {key: 'closed', color: 'closed', label: 'Closed', value: 2},
    {key: 'verified', color: 'verified', label: 'Verified', value: 1},
    {key: 'idle', color: 'idle', label: 'Idle Vehicles', value: 0},
    {key: 'opened', color: 'maintenance', label: 'Open in Maintenance', value: 3},
    {key: 'closed', color: 'mis', label: 'Open in MIS', value: 2},
  ];
  const trend = [
    {date: '2026-09-18', production: 2, mis: 1, opened: 1, closed: 1, verified: 0, idle: 0},
    {date: '2026-09-19', production: 3, mis: 1, opened: 2, closed: 2, verified: 1, idle: 0},
  ];
  const exported = requestLifecycleExport({trend, readings, place: 'Sasti OB', rangeLabel: '18-09-2026 - 19-09-2026'});
  assert.equal(exported.title, 'Request Lifecycle · Sasti OB · 18-09-2026 - 19-09-2026');
  assert.deepEqual(labels(exported), ['Date', 'Day', 'Production Request', 'Closed', 'Verified', 'Idle Vehicles', 'Open in Maintenance', 'Open in MIS']);
  assert.deepEqual(cells(exported), [
    ['18-09-2026', 'Fri', 2, 1, 0, 0, 1, 1],
    ['19-09-2026', 'Sat', 3, 2, 1, 0, 2, 1],
    ['Summary cards', '', 5, 2, 1, 0, 3, 2],
  ]);
  assertPlainExport(exported);
  assert.deepEqual(requestLifecycleExport({trend: [], readings, place: 'WCL', rangeLabel: ''}).rows, []);
});

test('Breakdown trend exports each day bar with its running total and gap to the daily baseline, then the Recorded and baseline cards', () => {
  const exported = breakdownTrendExport({place: 'All regions', from: '2026-09-17', to: '2026-09-19', total: 3, average: '1.0', trend: [
    {date: '2026-09-17', count: 2, kind: 'actual', anchor: false},
    {date: '2026-09-18', count: 0, kind: 'actual', anchor: false},
    {date: '2026-09-19', count: 1, kind: 'actual', anchor: true},
  ]});
  assert.equal(exported.title, 'Breakdown trend · All regions · 17-09-2026 to 19-09-2026');
  assert.deepEqual(labels(exported), ['Date', 'Day', 'Recorded breakdowns', 'Running total', 'Vs daily baseline']);
  assert.deepEqual(cells(exported), [
    ['17-09-2026', 'Thu', 2, 2, '+1.0'],
    ['18-09-2026', 'Fri', 0, 2, '-1.0'],
    ['19-09-2026', 'Sat', 1, 3, '0.0'],
    ['Recorded', '3 selected days', 3, '', ''],
    ['Daily baseline', 'Recorded per day', '1.0', '', ''],
  ]);
  assertPlainExport(exported);
  const forecast = breakdownTrendExport({place: 'Sasti OB', from: '2026-09-20', to: '2026-09-20', total: 0, average: '0.5', trend: [{date: '2026-09-20', count: 1, kind: 'forecast'}]});
  assert.deepEqual(cells(forecast)[0], ['20-09-2026', 'Sun · Forecast', 1, 1, '+0.5']);
  assert.equal(forecast.rows[1].day, '0 selected days');
  assert.deepEqual(breakdownTrendExport({trend: [], from: '2026-09-19', to: '2026-09-18'}).rows, []);
});
