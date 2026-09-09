// Keep the maintenance lifecycle value intact; MIS verification is recorded separately.
export function requestStatusLabel(request = {}) {
  return String(request.verifiedAt || '').trim() ? 'Verified' : String(request.status || '').trim() || 'Open';
}
