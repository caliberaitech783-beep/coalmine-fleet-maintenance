// Which maintenance requests may be deleted, shared by the API and the
// workspace tables so the Delete buttons and the server agree.
//
//   * Verified requests are never deleted.
//   * Idle requests (awaiting on-road approval) may only be deleted by an Admin
//     or Super Admin; Maintenance users keep their existing delete right for the
//     other unverified stages (open, awaiting acceptance, in progress, closed
//     and awaiting MIS verification).
const IDLE_STATUSES = new Set(["idle", "ideal"]);
export const REQUEST_BULK_DELETE_LIMIT = 200;

const text = (value) => String(value ?? "").trim();

export function requestDeletionBlocker(request, { administrator = false } = {}) {
  if (!request || !text(request.ref || request.reference)) return "The request no longer exists.";
  if (text(request.verifiedAt)) return "Verified requests cannot be deleted.";
  if (IDLE_STATUSES.has(text(request.status).toLowerCase()) && !administrator) return "Idle requests can only be deleted by an Admin.";
  return null;
}

export function requestDeletable(request, options) {
  return requestDeletionBlocker(request, options) === null;
}

/** Stage wording used in the Audit Trail snapshot of a deleted request. */
export function requestStageLabel(request = {}) {
  const status = text(request.status).toLowerCase();
  if (text(request.verifiedAt)) return "Verified";
  if (status === "closed" || text(request.closedAt)) return "Closed, awaiting MIS verification";
  if (IDLE_STATUSES.has(status)) return "Idle, awaiting on-road approval";
  if (request.acceptanceRequired === true && !text(request.acceptedAt)) return "Awaiting acceptance";
  if (text(request.inProgressAt) || status === "in progress") return "In progress";
  if (text(request.acceptedAt)) return "Accepted";
  return "Open";
}

/** Audit Trail "changed fields" describing a request that is being removed. */
export function requestDeletionSnapshot(request = {}) {
  const ref = text(request.ref || request.reference);
  const field = (label, value) => ({ field: `${ref} · ${label}`, before: text(value), after: "" });
  return [
    field("Stage", requestStageLabel(request)),
    field("Equipment", request.equipmentGroup || request.equipment),
    field("Door no.", request.door),
    field("Site", request.site),
    field("Breakdown type", request.category),
    field("Created by", request.owner || request.requesterLogin),
    field("Started", request.start),
    field("Closed", request.closedAt),
  ].filter((entry) => entry.before || entry.field.endsWith("Stage"));
}

/** Distinct, trimmed references for a bulk deletion (order preserved). */
export function normalizeDeletionReferences(value) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  const seen = new Set();
  const references = [];
  for (const item of list) {
    const ref = text(item);
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    references.push(ref);
  }
  return references;
}
