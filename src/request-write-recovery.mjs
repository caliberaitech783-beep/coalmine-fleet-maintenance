const text = (value) => String(value ?? "").trim();
const status = (request) => text(request?.status).toLowerCase();

// A write can reach the server even when a phone loses the response. Confirm
// the resulting lifecycle event from a fresh read instead of replaying the
// write and potentially recording the same user action twice.
export function requestWriteOutcomeConfirmed(before = {}, after = {}, action = "edit", payload = {}) {
  if (!after || text(after.ref || after.reference) !== text(before.ref || before.reference)) return false;
  if (action === "edit") {
    return before.acceptanceRequired === true && !text(before.acceptedAt) && Boolean(text(after.acceptedAt));
  }
  if (action === "close") {
    return Boolean(text(after.closedAt)) || ["closed", "idle", "ideal"].includes(status(after));
  }
  if (action === "verify") return Boolean(text(after.verifiedAt));
  if (action === "arrival-flag") return Boolean(text(after.arrivalFlaggedAt));
  if (action === "mis-flag") return Boolean(text(after.misFlaggedAt));
  if (action === "ideal-onroad") return Boolean(text(after.idealApprovedAt) || text(after.closedAt));
  if (action === "idle-cancel") return !["idle", "ideal"].includes(status(after));
  if (action === "delayed-reason") return text(after.delayedReason) === text(payload.delayedReason);
  return false;
}

export function requestWriteConnectionMessage(before = {}, action = "edit") {
  const accepting = action === "edit" && before.acceptanceRequired === true && !text(before.acceptedAt);
  return accepting
    ? "The phone connection was interrupted while accepting this vehicle. We checked the latest request but could not confirm acceptance. Your form is still open—check the network and tap Accept vehicle again."
    : "The connection was interrupted before this update could be confirmed. Your form is still open—check the network and try again.";
}
