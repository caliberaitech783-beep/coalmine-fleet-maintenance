export const TENURE_MONTHS = [3, 6, 9, 12, 24, 36, 48, 60];

function dateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? {year, month, day, time: date.getTime()} : null;
}

// Calendar months, followed by days since the last monthly anniversary.
// Month-end anniversaries clamp to the last day of the destination month.
export function employeeTenure(joined, asOf) {
  const start = dateParts(joined), end = dateParts(asOf);
  if (!start || !end || start.time > end.time) return null;
  let months = (end.year - start.year) * 12 + end.month - start.month;
  const anniversary = count => {
    const month = start.month - 1 + count;
    const lastDay = new Date(Date.UTC(start.year, month + 1, 0)).getUTCDate();
    return Date.UTC(start.year, month, Math.min(start.day, lastDay));
  };
  if (anniversary(months) > end.time) months--;
  const days = Math.floor((end.time - anniversary(months)) / 86400000);
  return {months, days, label: `${months}M - ${days} D`};
}

export function buildEmployeeTenureReport(directory, asOf, minimumMonths = 3) {
  if (!dateParts(asOf)) return {rows: [], missingDates: 0};
  const rows = [], seen = new Set();
  let missingDates = 0;
  for (const people of Object.values(directory?.matrix || {})) {
    for (const employee of people) {
      if (String(employee.status || '').trim().toUpperCase() !== 'ACTIVE' || !String(employee.name || '').trim()) continue;
      const id = String(employee.empId || '').trim().toUpperCase() || employee._k;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const tenure = employeeTenure(employee.dojISO, asOf);
      if (!tenure) { if (!dateParts(employee.dojISO)) missingDates++; continue; }
      if (tenure.months < Math.max(3, minimumMonths)) continue;
      rows.push({empId: employee.empId || '', name: employee.name, department: employee.department || '', designation: employee.designation || '', joiningDate: employee.dojISO, ...tenure});
    }
  }
  rows.sort((a, b) => b.months - a.months || b.days - a.days || a.name.localeCompare(b.name));
  return {rows, missingDates};
}
