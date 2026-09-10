const clampDays = (value) => [7, 14, 30].includes(Number(value)) ? Number(value) : 7;

export const localDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const offsetDateKey = (dateKey, days) => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};

const mean = (values) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

export function recordedBreakdownRangeLength(startDate, endDate) {
  const epoch = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return NaN;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
  };
  const days = (epoch(endDate) - epoch(startDate)) / 86400000 + 1;
  // Protect the daily chart from accidental multi-century input while allowing
  // ordinary multi-year history. Invalid ranges never silently become 7 days.
  return Number.isInteger(days) && days > 0 && days <= 3660 ? days : 0;
}

export function buildRecordedBreakdownTrend({ counts = {}, startDate, endDate } = {}) {
  const days = recordedBreakdownRangeLength(startDate, endDate);
  return Array.from({ length: days }, (_, index) => {
    const date = offsetDateKey(startDate, index);
    const count = Number(counts[date]);
    return { date, count: Number.isFinite(count) ? Math.max(0, count) : 0, kind: "actual", anchor: date === endDate };
  });
}

export function buildBreakdownTrend({ counts = {}, anchorDate, days = 7, view = "both" } = {}) {
  const period = clampDays(days);
  const anchor = localDateKey(anchorDate || new Date());
  const countFor = (date) => Math.max(0, Number(counts[date]) || 0);
  const actual = Array.from({ length: period }, (_, index) => {
    const date = offsetDateKey(anchor, index - period + 1);
    return { date, count: countFor(date), kind: "actual", anchor: date === anchor };
  });
  const recentAverage = mean(Array.from({ length: 14 }, (_, index) => countFor(offsetDateKey(anchor, -index))));
  const forecast = Array.from({ length: period }, (_, index) => {
    const date = offsetDateKey(anchor, index + 1);
    const targetWeekday = new Date(`${date}T12:00:00`).getDay();
    const comparableWeekdays = Array.from({ length: 56 }, (_, offset) => offsetDateKey(anchor, -offset))
      .filter((historicDate) => new Date(`${historicDate}T12:00:00`).getDay() === targetWeekday)
      .map(countFor);
    const weekdayAverage = mean(comparableWeekdays);
    const count = Math.max(0, Math.round((weekdayAverage * 0.55) + (recentAverage * 0.45)));
    return { date, count, kind: "forecast", anchor: false };
  });
  const normalizedView = ["past", "upcoming"].includes(view) ? view : "both";
  return normalizedView === "past" ? actual : normalizedView === "upcoming" ? forecast : [...actual, ...forecast];
}
