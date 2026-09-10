const durationKeys = new Set(["breakdowndays", "hours", "tat", "duration", "downtime", "acceptedtime", "flagwaitingtime", "arrivaldelay"]);

// Dates/timestamps and meter readings are not durations.
export function isDurationColumn(label = "", key = "") {
  return durationKeys.has(String(key).toLowerCase())
    || /^(days of breakdown|bd days\s*\/\s*hrs|downtime|turn\s*around time(?:\s*\(tat\))?|time taken|duration|arrival delay|waiting when flagged|time to accept)$/i.test(String(label).trim());
}

function durationValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  if (Number.isFinite(number)) return number < 0 ? null : number;
  const text = String(value).trim();
  if (!/^(?:\d+(?:\.\d+)?\s*(?:d(?:ays?)?|h(?:ours?)?|m(?:in(?:ute)?s?)?)\s*)+$/i.test(text)) return null;
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s*(d|h|m)[a-z]*/gi)]
    .reduce((total, [, amount, unit]) => total + Number(amount) * ({ d: 1440, h: 60, m: 1 }[unit.toLowerCase()]), 0);
}

export function compareDurationValues(left, right, direction = "asc") {
  const a = durationValue(left), b = durationValue(right);
  // Records without a recorded duration stay below actual times in either order.
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return (a - b) * (direction === "desc" ? -1 : 1);
}
