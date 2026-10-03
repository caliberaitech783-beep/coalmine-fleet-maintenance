import {indiaDateTimeInputValue} from '../report-date-range.mjs';

export const DASHBOARD_REFRESH_MS = 10 * 60 * 1000;

export function dashboardFinancialYearRange(now = new Date()) {
  const to = indiaDateTimeInputValue(now).slice(0, 10);
  const year = Number(to.slice(0, 4)) - (Number(to.slice(5, 7)) < 4 ? 1 : 0);
  return {from: `${year}-04-01`, to};
}
