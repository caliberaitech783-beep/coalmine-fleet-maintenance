// Keep the maintenance lifecycle value intact; MIS verification is recorded separately.
export function requestStatusLabel(request = {}) {
  return String(request.verifiedAt || '').trim() ? 'Verified' : String(request.status || '').trim() || 'Open';
}

// Lifecycle order used when sorting a Status column: open work first, verified closures last.
const STATUS_SORT_ORDER = { open: 0, pending: 1, accepted: 2, "in progress": 3, "awaiting parts": 4, idle: 5, ideal: 5, closed: 6, verified: 7 };
export function requestStatusSortRank(label) {
  const key = String(label || '').trim().toLowerCase();
  return key in STATUS_SORT_ORDER ? STATUS_SORT_ORDER[key] : Object.keys(STATUS_SORT_ORDER).length;
}
