import {formatDisplayDate} from '../date-time-format.mjs';

// Export tables for the Fleet control dashboard sections. Each builder takes the figures one
// section already shows and returns the {title, columns, rows} its Export menu (Download as PDF,
// Download as Excel, Smart Print) prints as a table, following the section's own filters. Values
// are plain numbers or text; the export builders add the serial number and print blanks as "—".
// Place columns are called "Site name", never plain "Site": the PDF heading appends every value of
// a column named Site or Location (reportPdfHeading), which would list every site and subtotal.

const percent = (part, whole) => (whole ? part / whole * 100 : 0).toFixed(1);
const tenths = value => Math.round(value * 10) / 10 || 0;
const signed = value => `${value > 0 ? '+' : ''}${value}`;
const weekday = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {weekday: 'short', timeZone: 'Asia/Kolkata'});
const dateRange = (from, to) => `${formatDisplayDate(from)} to ${formatDisplayDate(to)}`;
const heading = (...parts) => parts.filter(Boolean).join(' · ');

const FLEET_COLUMNS = [
  {label: 'Region', value: row => row.region},
  {label: 'Site name', value: row => row.name},
  {label: 'Equipment', value: row => row.equipment},
  {label: 'Vehicles', value: row => row.vehicles},
  {label: 'Total fleet', value: row => row.total},
  {label: 'Equipment BD', value: row => row.bdEquipment},
  {label: 'Vehicle BD', value: row => row.bdVehicles},
  {label: 'BD balance', value: row => row.bdTotal},
  {label: 'BD (%)', value: row => percent(row.bdTotal, row.total)},
];
const fleetRow = (region, name, counts = {}) => ({
  region, name,
  equipment: counts.equipment || 0, vehicles: counts.vehicles || 0, total: counts.total || 0,
  bdEquipment: counts.breakdown?.equipment || 0, bdVehicles: counts.breakdown?.vehicles || 0, bdTotal: counts.breakdown?.total || 0,
});

const OEM_COLUMNS = [
  {label: 'Region', value: row => row.region},
  {label: 'Site name', value: row => row.name},
  {label: 'OEM', value: row => row.oem},
  {label: 'BD count', value: row => row.count},
  {label: 'Share of OEM BD (%)', value: row => percent(row.count, row.all)},
];

// OEM BD: each site's breakdowns per OEM, as the stacked OEM bars show them, with a site total
// where a site has more than one OEM, a total per region and the overall OEM BD count.
function oemSectionExport({place, chart, oemLabel, period, stale}) {
  const sites = chart?.sites || [];
  const all = chart?.rows?.length || 0;
  const rows = [];
  for (const region of [...new Set(sites.map(site => site.region))]) {
    const regionSites = sites.filter(site => site.region === region);
    for (const site of regionSites) {
      const segments = site.segments || [];
      if (!segments.length) rows.push({region, name: site.name, oem: 'No breakdowns', count: 0, all});
      for (const segment of segments) rows.push({region, name: site.name, oem: segment.label, count: segment.rows.length, all});
      if (segments.length > 1) rows.push({region, name: `${site.name} total`, oem: oemLabel, count: site.total, all});
    }
    rows.push({region, name: `${region} total`, oem: oemLabel, count: regionSites.reduce((total, site) => total + site.total, 0), all});
  }
  rows.push({region: 'Total', name: 'All sites', oem: oemLabel, count: all, all});
  return {title: heading('OEM BD', place, oemLabel, period, stale ? 'Last checked data' : ''), columns: OEM_COLUMNS, rows};
}

// Total Fleet: one row per site bar (equipment and vehicle counts, their breakdowns, BD balance and
// BD %), the region footer totals and the dashboard total behind the Total and Breakdown counters.
// Fleet whose location matches no chart site counts in that total but in no bar, so it gets its own
// row and the columns still add up. OEM BD mode exports the OEM chart instead. While the dashboard is
// reconnecting the title says the figures are the last checked data, not live.
export function fleetSectionExport({mode = 'total', place = 'All regions', regions = [], totals = null, oemChart = null, oemLabel = 'All OEMs', period = '', stale = false} = {}) {
  if (mode === 'oem') return oemSectionExport({place, chart: oemChart, oemLabel, period, stale});
  const rows = regions.flatMap(region => [
    ...(region.sites || []).map(site => fleetRow(region.code, site.name, site)),
    fleetRow(region.code, `${region.code} total`, region),
  ]);
  if (totals) {
    const rest = (pick) => Math.max(0, (pick(totals) || 0) - regions.reduce((total, region) => total + (pick(region) || 0), 0));
    const other = fleetRow('Other', 'Location matches no chart site', {
      equipment: rest(counts => counts.equipment), vehicles: rest(counts => counts.vehicles), total: rest(counts => counts.total),
      breakdown: {equipment: rest(counts => counts.breakdown?.equipment), vehicles: rest(counts => counts.breakdown?.vehicles), total: rest(counts => counts.breakdown?.total)},
    });
    if (other.total || other.bdTotal) rows.push(other);
    rows.push(fleetRow('Total', 'All sites', totals));
  }
  return {title: heading('Total Fleet', place, stale ? 'Last checked data' : 'Live fleet'), columns: FLEET_COLUMNS, rows};
}

const DAILY_COLUMNS = [
  {label: 'Date', value: row => row.label},
  {label: 'Day', value: row => row.day},
  {label: 'Opening BD', value: row => row.open},
  {label: 'BD In', value: row => row.incoming},
  {label: 'BD Out', value: row => row.outgoing},
  {label: 'Closing BD', value: row => row.balance},
  {label: 'Idle vehicles', value: row => row.idle},
  {label: 'Net change', value: row => signed(row.delta)},
  // The chart's change pill: no percentage when the opening balance was 0.
  {label: 'Change (%)', value: row => row.percent === null ? `+${row.delta} from 0` : `${row.delta > 0 ? '+' : ''}${row.percent.toFixed(1)}%`},
];

// Daily BD balance: one row per day in the chart (opening, BD In, BD Out, closing, idle and the
// change) and, over more than one day, the selected-period totals from the summary cards.
export function dailyBdBalanceExport({ledger = null, from, to, today, stale = false, place = 'All regions'} = {}) {
  const days = ledger?.days || [];
  const rows = days.map(day => ({...day, label: formatDisplayDate(day.date), day: day.date === today ? (stale ? 'Today · last checked' : 'Today · live') : weekday(day.date)}));
  if (ledger?.totals && days.length > 1) rows.push({...ledger.totals, label: 'Selected period', day: dateRange(from, to)});
  return {title: heading('Daily BD balance', place, dateRange(from, to), stale ? 'Last checked data' : to === today ? 'Today so far' : ''), columns: DAILY_COLUMNS, rows};
}

const MOVEMENT_COLUMNS = [
  {label: 'Site name', value: row => row.name},
  {label: 'BD Open', value: row => row.open},
  {label: 'BD In', value: row => row.incoming},
  {label: 'BD Out', value: row => row.outgoing},
  {label: 'BD Balance', value: row => row.balance},
  {label: 'Idle Vehicles', value: row => row.idle},
  {label: 'Availability count (%)', value: row => row.availability},
  {label: 'On road', value: row => row.onRoad},
  {label: 'Off road', value: row => row.offRoad},
  {label: 'Total fleet', value: row => row.total},
  {label: 'Share of open BD balance (%)', value: row => row.share},
];
const AVAILABILITY_COLUMNS = [
  {label: 'Site name', value: row => row.name},
  {label: 'Total fleet', value: row => row.total},
  {label: 'On road', value: row => row.onRoad},
  {label: 'Off road', value: row => row.offRoad},
  {label: 'Idle', value: row => row.idle},
  {label: 'Availability (%)', value: row => row.availability},
  {label: 'Status distribution', value: row => row.total ? `On road ${percent(row.onRoad, row.total)}% · Off road ${percent(row.offRoad, row.total)}% · Idle ${percent(row.idle, row.total)}%` : ''},
];
const NO_ROAD = {total: 0, onRoad: 0, offRoad: 0, idle: 0, availability: 0};
const availabilityPercent = road => road?.total ? Math.round(((road.onRoad + road.idle) / road.total) * 100) : 0;
const roadFigures = road => ({idle: road.idle, availability: availabilityPercent(road), onRoad: road.onRoad, offRoad: road.offRoad, total: road.total});

// Tracking Vehicle Throughput follows its open tab. Site-wise BD Movement: the site table (movement
// and its availability count impact), the all-sites total, the four summary cards and the BD Type
// Mix. The cards count requests, so their BD Balance leaves idle out and their Idle Vehicles counts
// idle requests, unlike the table's idle equipment. Availability Count: the site table and total.
export function throughputSectionExport({tab = 'breakdown', place = 'All regions', period = '', availabilityLabel = '', sites = [], roadBySite = new Map(), movementTotals = {}, openBalance = 0, idleRequests = 0, typeMix = [], availabilitySites = [], availabilityTotals = NO_ROAD} = {}) {
  if (tab !== 'breakdown') return {
    title: heading('Tracking Vehicle Throughput', 'Availability Count', place, period, availabilityLabel),
    columns: AVAILABILITY_COLUMNS,
    rows: [...availabilitySites.map(site => ({name: site.site, ...roadFigures(site)})), {name: 'All sites total', ...roadFigures(availabilityTotals)}],
  };
  const totals = {open: 0, incoming: 0, outgoing: 0, balance: 0, ...movementTotals};
  return {
    title: heading('Tracking Vehicle Throughput', 'Site-wise BD Movement', place, period, availabilityLabel),
    columns: MOVEMENT_COLUMNS,
    rows: [
      ...sites.map(site => ({name: site.site, open: site.open, incoming: site.incoming, outgoing: site.outgoing, balance: site.balance, ...roadFigures(roadBySite.get(site.site) || NO_ROAD)})),
      {name: 'All sites total', open: totals.open, incoming: totals.incoming, outgoing: totals.outgoing, balance: totals.balance, ...roadFigures(availabilityTotals)},
      {name: 'Summary · BD In (opening + new)', incoming: totals.open + totals.incoming},
      {name: 'Summary · BD Out', outgoing: totals.outgoing},
      {name: 'Summary · BD Balance (open, excluding idle)', balance: openBalance},
      {name: 'Summary · Idle Vehicles (idle requests)', idle: idleRequests},
      ...typeMix.map(type => ({name: `BD Type Mix · ${type.label}`, balance: type.count, share: type.percentage})),
    ],
  };
}

// Request Lifecycle: one row per day with the six grouped bars, in the chart's order, and the
// summary cards for the selected range. Open in MIS reads each day's "mis" count, as the chart does.
export function requestLifecycleExport({trend = [], readings = [], place = 'All regions', rangeLabel = ''} = {}) {
  const dayKey = reading => reading.color === 'mis' ? 'mis' : reading.key;
  const columns = [
    {label: 'Date', value: row => row.label},
    {label: 'Day', value: row => row.day},
    ...readings.map((reading, index) => ({label: reading.label, value: row => row.counts[index]})),
  ];
  const rows = trend.map(day => ({label: formatDisplayDate(day.date), day: weekday(day.date), counts: readings.map(reading => day[dayKey(reading)] ?? 0)}));
  if (rows.length) rows.push({label: 'Summary cards', day: '', counts: readings.map(reading => reading.value ?? 0)});
  return {title: heading('Request Lifecycle', place, rangeLabel), columns, rows};
}

const TREND_COLUMNS = [
  {label: 'Date', value: row => row.label},
  {label: 'Day', value: row => row.day},
  {label: 'Recorded breakdowns', value: row => row.count},
  {label: 'Running total', value: row => row.running},
  {label: 'Vs daily baseline', value: row => row.vsBaseline},
];

// Breakdown trend: one row per day bar with its running total and difference from the daily
// baseline, then the Recorded and Daily baseline cards.
export function breakdownTrendExport({trend = [], place = 'All regions', from, to, total = 0, average = '0.0'} = {}) {
  const baseline = Number(average) || 0;
  let running = 0;
  const rows = trend.map(day => {
    running += day.count;
    const delta = tenths(day.count - baseline);
    return {label: formatDisplayDate(day.date), day: `${weekday(day.date)}${day.kind === 'forecast' ? ' · Forecast' : ''}`, count: day.count, running, vsBaseline: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`};
  });
  if (rows.length) rows.push(
    {label: 'Recorded', day: `${trend.filter(day => day.kind !== 'forecast').length} selected days`, count: total},
    {label: 'Daily baseline', day: 'Recorded per day', count: average},
  );
  return {title: heading('Breakdown trend', place, dateRange(from, to)), columns: TREND_COLUMNS, rows};
}
