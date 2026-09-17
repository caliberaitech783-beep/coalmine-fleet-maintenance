// A delayed reason applies as soon as the current time passes the ETC; there is no grace period.
export const DELAYED_REASON_THRESHOLD_HOURS = 0;

export const DELAYED_REASON_DEFAULTS = [
  'Parts - OEM',
  'Parts - CMLL',
  'Tools NA - OEM',
  'Tools NA - CMLL',
  'Repair in progress - OEM',
  'Repair in progress - CMLL',
  'Approval - OEM',
  'Approval - CMLL',
  'Fault Diagnosis - OEM',
  'Acc- Insurance Survey-OEM',
  'Acc- Insurance Survey-CMLL',
  'Acc- Insurance Approval-CMLL',
  'Acc- Insurance Approval-OEM',
  'Acc- Repair Estimate-CMLL',
  'Acc- Repair Estimate-OEM',
  'Superstructure - Parts',
  'Superstructure - Manpower',
  'Superstructure - Repair',
  'Manpower shortage - OEM',
  'Manpower shortage - CMLL',
];

function indiaTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  const raw = String(value || '').trim();
  if (!raw) return Number.NaN;
  const indiaLocal = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (indiaLocal) return Date.parse(`${indiaLocal[1]}T${indiaLocal[2]}:${indiaLocal[3] || '00'}+05:30`);
  return Date.parse(raw);
}

const COMMON_DELAYED_REASONS = [
  'Parts - OEM',
  'Parts - CMLL',
  'Tools NA - OEM',
  'Tools NA - CMLL',
  'Repair in progress - OEM',
  'Repair in progress - CMLL',
  'Approval - OEM',
  'Approval - CMLL',
];
const MANPOWER_DELAYED_REASONS = ['Manpower shortage - OEM', 'Manpower shortage - CMLL'];

// Delayed reasons offered per breakdown (repair) type. Every other repair type
// (Breakdown, Preventive, Aggregate Repair, WGM, ...) uses GENERAL.
export const DELAYED_REASONS_BY_REPAIR_TYPE = {
  ACCIDENTAL: [
    ...COMMON_DELAYED_REASONS,
    'Acc- Insurance Survey-OEM',
    'Acc- Insurance Survey-CMLL',
    'Acc- Insurance Approval-CMLL',
    'Acc- Insurance Approval-OEM',
    'Acc- Repair Estimate-CMLL',
    'Acc- Repair Estimate-OEM',
    ...MANPOWER_DELAYED_REASONS,
  ],
  SUPERSTRUCTURE: [
    ...COMMON_DELAYED_REASONS,
    'Fault Diagnosis - OEM',
    'Superstructure - Parts',
    'Superstructure - Manpower',
    'Superstructure - Repair',
    ...MANPOWER_DELAYED_REASONS,
  ],
  GENERAL: [
    ...COMMON_DELAYED_REASONS,
    'Fault Diagnosis - OEM',
    ...MANPOWER_DELAYED_REASONS,
  ],
};

const reasonKey = (value) => String(value || '').trim().toLowerCase();
const repairTypeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z]/g, '');

// Breakdown types stored against each default reason in the Delayed Reason master
// ("All" = every type). Admins can edit this field; it drives the reason picker.
const REPAIR_TYPE_LABELS = {ACCIDENTAL: 'Accidental', SUPERSTRUCTURE: 'Super Structure', GENERAL: 'Breakdown, Preventive, Aggregate Repair, WGM'};
export const DELAYED_REASON_DEFAULT_REPAIR_TYPES = Object.fromEntries(DELAYED_REASON_DEFAULTS.map((reason) => {
  const groups = Object.keys(REPAIR_TYPE_LABELS).filter((group) => DELAYED_REASONS_BY_REPAIR_TYPE[group].includes(reason));
  return [reason, groups.length === Object.keys(REPAIR_TYPE_LABELS).length ? 'All' : groups.map((group) => REPAIR_TYPE_LABELS[group]).join(', ')];
}));

export function parseDelayedReasonRepairTypes(value) {
  return String(Array.isArray(value) ? value.join(',') : value || '').split(/[,;|\n]/).map(repairTypeKey).filter(Boolean);
}

export function delayedReasonListForRepairType(repairType) {
  const key = repairTypeKey(repairType);
  if (key === 'accidental') return DELAYED_REASONS_BY_REPAIR_TYPE.ACCIDENTAL;
  if (key === 'superstructure') return DELAYED_REASONS_BY_REPAIR_TYPE.SUPERSTRUCTURE;
  return DELAYED_REASONS_BY_REPAIR_TYPE.GENERAL;
}

// Options for a request: the list defined for its repair type, in the defined
// order, limited to reasons still present in the Delayed Reason master, plus any
// custom reasons added to the master that belong to no defined list.
// masterRecords are Delayed Reason master records ({delayedReason, repairTypes}) or plain reason strings.
// A record with breakdown types applies only to those types ("All" = every type). A record without them
// falls back to the approved list for a default reason, and to every type for a custom reason.
export function delayedReasonsForRepairType(repairType, masterRecords = []) {
  const list = delayedReasonListForRepairType(repairType);
  const seen = new Set();
  const entries = masterRecords
    .map((record) => (record && typeof record === 'object' ? record : {delayedReason: record}))
    .map((record) => ({reason: String(record.delayedReason || '').trim(), types: parseDelayedReasonRepairTypes(record.repairTypes)}))
    .filter((entry) => entry.reason && !seen.has(reasonKey(entry.reason)) && seen.add(reasonKey(entry.reason)));
  if (!entries.length) return [...list];
  const typeKey = repairTypeKey(repairType) || 'breakdown';
  const listOrder = new Map(list.map((reason, index) => [reasonKey(reason), index]));
  const definedKeys = new Set(DELAYED_REASON_DEFAULTS.map(reasonKey));
  const applies = (entry) => entry.types.length
    ? entry.types.some((type) => type === typeKey || type.startsWith('all'))
    : !definedKeys.has(reasonKey(entry.reason)) || listOrder.has(reasonKey(entry.reason));
  const rank = (entry) => listOrder.has(reasonKey(entry.reason)) ? listOrder.get(reasonKey(entry.reason)) : list.length;
  return entries.filter(applies).map((entry, index) => ({entry, index}))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
    .map(({entry}) => entry.reason);
}

export function delayedReasonRequired(expectedCompletionAt, closingAt, thresholdHours = DELAYED_REASON_THRESHOLD_HOURS) {
  const expected = indiaTimestamp(expectedCompletionAt);
  const closed = indiaTimestamp(closingAt);
  return Number.isFinite(expected)
    && Number.isFinite(closed)
    && closed - expected >= Number(thresholdHours) * 60 * 60 * 1000;
}
