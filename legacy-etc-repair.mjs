const INDIA_OFFSET_MS = 330 * 60_000;
const HALF_DAY_MS = 12 * 60 * 60_000;
const MINUTE_MS = 60_000;

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

function indiaDate(milliseconds) {
  return new Date(milliseconds + INDIA_OFFSET_MS).toISOString().slice(0, 10);
}

function indiaHour(milliseconds) {
  return new Date(milliseconds + INDIA_OFFSET_MS).getUTCHours();
}

export function legacyEtcRepairPlan(startedAt, expectedCompletionAt) {
  const start = timestamp(startedAt);
  const entered = timestamp(expectedCompletionAt);
  if (!Number.isFinite(start) || !Number.isFinite(entered) || entered > start) return null;

  const inferredPm = entered + HALF_DAY_MS;
  const amPmInversion = indiaDate(entered) === indiaDate(start)
    && indiaHour(entered) < 12
    && inferredPm >= start
    && indiaDate(inferredPm) === indiaDate(start);
  const replacement = amPmInversion
    ? inferredPm
    : Math.floor(start / MINUTE_MS) * MINUTE_MS + MINUTE_MS;

  return {
    before: new Date(entered),
    after: new Date(replacement),
    strategy: amPmInversion ? 'am-pm-inversion' : 'first-valid-minute',
  };
}

export function legacyEtcRepairReason(strategy) {
  return strategy === 'am-pm-inversion'
    ? 'Legacy ETC corrected from AM to PM because the stored same-day time preceded the breakdown and the PM value is the valid same-day deadline.'
    : 'Legacy ETC preceded the breakdown and was corrected to the first full minute after the breakdown under the approved cleanup rule.';
}
