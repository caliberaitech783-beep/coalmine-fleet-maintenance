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

export function delayedReasonListForRepairType(repairType) {
  const key = repairTypeKey(repairType);
  if (key === 'accidental') return DELAYED_REASONS_BY_REPAIR_TYPE.ACCIDENTAL;
  if (key === 'superstructure') return DELAYED_REASONS_BY_REPAIR_TYPE.SUPERSTRUCTURE;
  return DELAYED_REASONS_BY_REPAIR_TYPE.GENERAL;
}

// Options for a request: the list defined for its repair type, in the defined
// order, limited to reasons still present in the Delayed Reason master, plus any
// custom reasons added to the master that belong to no defined list.
export function delayedReasonsForRepairType(repairType, masterReasons = []) {
  const list = delayedReasonListForRepairType(repairType);
  const master = [...new Set(masterReasons.map((reason) => String(reason || '').trim()).filter(Boolean))];
  if (!master.length) return [...list];
  const masterKeys = new Set(master.map(reasonKey));
  const definedKeys = new Set(DELAYED_REASON_DEFAULTS.map(reasonKey));
  return [
    ...list.filter((reason) => masterKeys.has(reasonKey(reason))),
    ...master.filter((reason) => !definedKeys.has(reasonKey(reason))),
  ];
}

export function delayedReasonRequired(expectedCompletionAt, closingAt, thresholdHours = DELAYED_REASON_THRESHOLD_HOURS) {
  const expected = indiaTimestamp(expectedCompletionAt);
  const closed = indiaTimestamp(closingAt);
  return Number.isFinite(expected)
    && Number.isFinite(closed)
    && closed - expected >= Number(thresholdHours) * 60 * 60 * 1000;
}
