const dateKey = (value) => String(value || "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";

export const BREAKDOWN_TYPE_LABELS = ["Breakdown", "Accidental", "Preventive", "Aggregate Repair", "Super Structure", "WGM"];

export const normalizedBreakdownType = (value) => {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (["breakdown", "bd"].includes(normalized)) return "Breakdown";
  if (["accidental", "accident"].includes(normalized)) return "Accidental";
  if (["preventive", "preventative", "pm"].includes(normalized)) return "Preventive";
  if (["aggregate", "aggregate repair"].includes(normalized)) return "Aggregate Repair";
  if (["super structure", "superstructure"].includes(normalized)) return "Super Structure";
  if (normalized === "wgm") return "WGM";
  return "";
};

export function breakdownOpenedDate(record = {}) {
  return dateKey(record.start) || dateKey(record.startedAt) || dateKey(record.createdAt);
}

export function breakdownClosedDate(record = {}) {
  const recorded = dateKey(record.closedAt) || dateKey(record.completedAt);
  if (recorded) return recorded;
  return String(record.status || "").trim().toLowerCase() === "closed"
    ? breakdownOpenedDate(record)
    : "";
}

// Empty bounds mean all time. Share the predicate with linked request lists so
// every metric opens exactly the requests it counts, including legacy history.
export function matchesBreakdownMovement(record, start = "", end = "", metric = "all") {
  if (start && end && start > end) return false;
  const opened = breakdownOpenedDate(record), closed = breakdownClosedDate(record);
  if (!start && !end) {
    const completed = Boolean(closed) || String(record.status || "").trim().toLowerCase() === "closed";
    return metric === "open" ? false : metric === "outgoing" ? completed : metric === "balance" ? !completed : ["all", "incoming"].includes(metric);
  }
  if (!opened) return false;
  if (metric === "open") return Boolean(start) && opened < start && (!closed || closed >= start);
  if (metric === "incoming") return (!start || opened >= start) && (!end || opened <= end);
  if (metric === "outgoing") return Boolean(closed) && (!start || closed >= start) && (!end || closed <= end);
  if (metric === "balance") return (!end || opened <= end) && (!closed || (Boolean(end) && closed > end));
  return metric === "all" && (!end || opened <= end) && (!closed || !start || closed >= start);
}

export function breakdownMovementForRange(records = [], startDate = "", endDate = "") {
  return Object.fromEntries(["open", "incoming", "outgoing", "balance"].map((metric) => [
    metric, records.filter((record) => matchesBreakdownMovement(record, startDate, endDate, metric)).length,
  ]));
}

export function dailyBreakdownMovement(records = [], startDate = "", endDate = "") {
  if (!startDate || !endDate || startDate > endDate) return [];
  const rows = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end) {
    const date = [cursor.getFullYear(), String(cursor.getMonth() + 1).padStart(2, "0"), String(cursor.getDate()).padStart(2, "0")].join("-");
    rows.push({ date, ...breakdownMovementForRange(records, date, date) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

export function breakdownTypeShare(records = [], startDate = "", endDate = "") {
  const incoming = records.filter((record) => matchesBreakdownMovement(record, startDate, endDate, "incoming"));
  const total = incoming.length;
  const counts = incoming.reduce((result, record) => {
    const label = normalizedBreakdownType(record.category || record.repairType || record.type);
    if (label) result[label] = (result[label] || 0) + 1;
    return result;
  }, {});
  return BREAKDOWN_TYPE_LABELS.map((label) => ({
    label,
    count: counts[label] || 0,
    percentage: total ? Math.round(((counts[label] || 0) / total) * 100) : 0,
  }));
}
