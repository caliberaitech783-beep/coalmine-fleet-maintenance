export const MIS_HIDDEN_REQUEST_REFERENCES = new Set([
  "REQ-1787994776734",
  "REQ-1787994588710",
  "REQ-1787759984730",
]);

export function requestsVisibleToSession(rows = [], session = {}) {
  if (session?.role !== "normal" || session?.assignedRole !== "MIS User") return rows;
  return rows.filter((row) => !MIS_HIDDEN_REQUEST_REFERENCES.has(String(row?.ref || row?.reference || "").trim().toUpperCase()));
}
