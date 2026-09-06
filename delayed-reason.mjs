export const DELAYED_REASON_THRESHOLD_HOURS = 4;

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

export function delayedReasonRequired(expectedCompletionAt, closingAt, thresholdHours = DELAYED_REASON_THRESHOLD_HOURS) {
  const expected = indiaTimestamp(expectedCompletionAt);
  const closed = indiaTimestamp(closingAt);
  return Number.isFinite(expected)
    && Number.isFinite(closed)
    && closed - expected >= Number(thresholdHours) * 60 * 60 * 1000;
}
