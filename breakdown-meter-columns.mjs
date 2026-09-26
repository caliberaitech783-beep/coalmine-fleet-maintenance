import {requestMeterReadings} from './request-equipment.mjs';

// HMR / KMR readings recorded on a breakdown request, shared by every
// breakdown report and dashboard table so the values read the same everywhere.
// Opening readings are taken when the breakdown is raised, closing readings
// when maintenance puts the machine back on road. Equipment without an
// odometer has no KMR, and readings not yet recorded show a dash.
export const METER_EMPTY = '—';
const METER_KEY = /^(?:opening|closing|latest)(?:Hmr|Kmr)$/;

function reading(request, type, stage, records) {
  if (!request) return '';
  return String(requestMeterReadings(request, stage, records)[type] ?? '').trim();
}

export function breakdownMeterValue(request, type, stage = 'opening', records = []) {
  return reading(request, type, stage, records) || METER_EMPTY;
}

// The latest known reading of a breakdown: its closing reading once
// maintenance has closed it, otherwise the reading taken when it was raised.
export function latestBreakdownMeterValue(request, type, records = []) {
  return reading(request, type, 'closing', records) || reading(request, type, 'opening', records) || METER_EMPTY;
}

// Raw readings for record builders (dashboard drilldowns); unset readings stay undefined.
export function breakdownMeterFields(request, records = []) {
  const value = (type, stage) => reading(request, type, stage, records) || undefined;
  return {hmr: value('HMR', 'opening'), kmr: value('KMR', 'opening'), closingHmr: value('HMR', 'closing'), closingKmr: value('KMR', 'closing')};
}

export function breakdownMeterColumns({stage = 'opening', source = (row) => row, label = ''} = {}) {
  const prefix = label || (stage === 'closing' ? 'Closing' : stage === 'latest' ? 'Latest' : 'Opening');
  return ['HMR', 'KMR'].map((type) => ({
    key: `${stage}${type[0]}${type.slice(1).toLowerCase()}`,
    label: `${prefix} ${type}`,
    value: (row) => stage === 'latest' ? latestBreakdownMeterValue(source(row), type) : breakdownMeterValue(source(row), type, stage),
  }));
}

const OPENING_ANCHORS = ['complaint', 'reason', 'latestReason', 'model', 'equipmentGroup', 'door'];
const CLOSING_ANCHORS = ['closedAt'];
// Columns that describe the closure itself stay beside the closing time.
const CLOSURE_COMPANIONS = ['closedBy', 'delay'];

function insertAfter(columns, anchors, inserted, companions = []) {
  const index = anchors.map((key) => columns.findIndex((column) => column?.key === key)).find((position) => position >= 0);
  let at = index === undefined ? columns.length : index + 1;
  while (at < columns.length && companions.includes(columns[at]?.key)) at += 1;
  return [...columns.slice(0, at), ...inserted, ...columns.slice(at)];
}

// Adds Opening HMR / KMR beside the breakdown reason (or the asset details when
// a report has no reason column) and, for reports that include closed cases,
// Closing HMR / KMR beside the closing time. Columns that already carry meter
// readings are left alone.
export function withBreakdownMeterColumns(columns = [], {closing = false, source} = {}) {
  if (columns.some((column) => METER_KEY.test(column?.key || ''))) return columns;
  const opened = insertAfter(columns, OPENING_ANCHORS, breakdownMeterColumns({stage: 'opening', source}));
  if (!closing) return opened;
  const closingColumns = breakdownMeterColumns({stage: 'closing', source});
  return opened.some((column) => CLOSING_ANCHORS.includes(column?.key))
    ? insertAfter(opened, CLOSING_ANCHORS, closingColumns, CLOSURE_COMPANIONS)
    : insertAfter(opened, ['openingKmr'], closingColumns);
}
