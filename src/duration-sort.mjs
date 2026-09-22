const durationKeys = new Set([
  "breakdowndays", "days", "hours", "tat", "duration", "durationms", "downtime", "acceptedtime", "flagwaitingtime", "arrivaldelay",
  "prodtomis", "mainttomis", "idletime", "mistofirsttrip", "averagetat", "difference", "delay", "closetomis", "closetofirsttrip", "firsttriptomis",
  "waitingtat", "maintenancetat", "returntoworktat", "overalltat", "repairelapsed", "verificationlag",
  "raisedtoaccepted", "acceptedtoonroad", "onroadtoproductiontrip", "productiontriptomistrip", "mistriptoverified", "onroadtomistrip", "onroadtoverified", "raisedtoverified",
]);

// Dates/timestamps and meter readings are not durations.
export function isDurationColumn(label = "", key = "") {
  return durationKeys.has(String(key).toLowerCase())
    || /^(days of breakdown|bd timing|bd days\s*\/\s*hrs|(?:productive|breakdown|available) (?:hrs|hours)|downtime|tat|turn\s*around time(?:\s*\(tat\))?|time taken|duration|arrival delay|waiting when flagged|time to accept)$/i.test(String(label).trim());
}

export function defaultDurationSort(columns = []) {
  const durations = columns.filter((column) => isDurationColumn(column.label, column.key));
  const column = durations.find((column) => ["breakdowndays", "days"].includes(String(column.key).toLowerCase()) || /^(days of breakdown|bd days\s*\/\s*hrs|breakdown (?:hrs|hours))$/i.test(String(column.label).trim())) || durations[0];
  return column ? { key: column.key, direction: "desc" } : { key: "", direction: "asc" };
}

function durationValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  if (Number.isFinite(number)) return number < 0 ? null : number;
  const text = String(value).trim();
  if (!/^(?:\d+(?:\.\d+)?\s*(?:d(?:ays?)?|h(?:ours?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\s*)+$/i.test(text)) return null;
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s*(d|h|m|s)[a-z]*/gi)]
    .reduce((total, [, amount, unit]) => total + Number(amount) * ({ d: 1440, h: 60, m: 1, s: 1 / 60 }[unit.toLowerCase()]), 0);
}

export function compareDurationValues(left, right, direction = "asc") {
  const a = durationValue(left), b = durationValue(right);
  // Records without a recorded duration stay below actual times in either order.
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return (a - b) * (direction === "desc" ? -1 : 1);
}
