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

export function breakdownMovementForRange(records = [], startDate = "", endDate = "") {
  if (!startDate || !endDate || startDate > endDate) return { open: 0, incoming: 0, outgoing: 0, balance: 0 };

  const dated = records.map((record) => ({
    opened: breakdownOpenedDate(record),
    closed: breakdownClosedDate(record),
  })).filter((record) => record.opened);
  const open = dated.filter((record) => record.opened < startDate && (!record.closed || record.closed >= startDate)).length;
  const incoming = dated.filter((record) => record.opened >= startDate && record.opened <= endDate).length;
  const outgoing = dated.filter((record) => record.closed >= startDate && record.closed <= endDate).length;

  return { open, incoming, outgoing, balance: Math.max(0, open + incoming - outgoing) };
}

export function dailyBreakdownMovement(records = [], startDate = "", endDate = "") {
  if (!startDate || !endDate || startDate > endDate) return [];
  const rows = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end && rows.length < 366) {
    const date = [cursor.getFullYear(), String(cursor.getMonth() + 1).padStart(2, "0"), String(cursor.getDate()).padStart(2, "0")].join("-");
    rows.push({ date, ...breakdownMovementForRange(records, date, date) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

export function breakdownTypeShare(records = [], startDate = "", endDate = "") {
  const incoming = records.filter((record) => {
    const opened = breakdownOpenedDate(record);
    return opened && opened >= startDate && opened <= endDate;
  });
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
