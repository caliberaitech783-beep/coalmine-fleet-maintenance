// Prefer recorded lifecycle events when an older request still carries the
// original Open database value. Explicit later states always win.
export function requestStatusLabel(request = {}) {
  if (String(request.verifiedAt || '').trim()) return 'Verified';
  const status = String(request.status || '').trim();
  const normalized = status.toLowerCase();
  if (String(request.closedAt || request.completedAt || '').trim() || normalized === 'closed') return 'Closed';
  if (normalized === 'ideal') return 'Idle';
  if (normalized && normalized !== 'open') return status;
  if (String(request.inProgressAt || '').trim()) return 'In progress';
  if (String(request.acceptedAt || '').trim()) return 'Accepted';
  // Requests created before acceptance tracking never recorded an acceptance time; maintenance saving an
  // expected completion is the same act, so show them as Accepted rather than a misleading Open.
  if (request.acceptanceRequired === false && String(request.expectedCompletionAt || '').trim()) return 'Accepted';
  return status || 'Open';
}

// Lifecycle order used when sorting a Status column: open work first, verified closures last.
const STATUS_SORT_ORDER = { open: 0, pending: 1, accepted: 2, "in progress": 3, "awaiting parts": 4, idle: 5, ideal: 5, closed: 6, verified: 7 };
export function requestStatusSortRank(label) {
  const key = String(label || '').trim().toLowerCase();
  return key in STATUS_SORT_ORDER ? STATUS_SORT_ORDER[key] : Object.keys(STATUS_SORT_ORDER).length;
}
