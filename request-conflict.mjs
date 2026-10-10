import {isIdleVehicleRequest} from './request-idle.mjs';

function normalized(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

export function isActiveMaintenanceRequest(request = {}) {
  if (isIdleVehicleRequest(request)) return true;
  const closedAt = request.closedAt ?? request.closed_at;
  const verifiedAt = request.verifiedAt ?? request.verified_at;
  if(normalized(request.status)==="running bd")return true;
  return normalized(request.status) !== "closed"
    && !String(closedAt ?? "").trim()
    && !String(verifiedAt ?? "").trim();
}

export function findActiveRequestConflict(requests = [], { door = "", chassis = "" } = {}) {
  const normalizedDoor = normalized(door);
  const normalizedChassis = normalized(chassis);
  if (!normalizedDoor && !normalizedChassis) return null;

  const matching = requests.filter((request) => {
    if (!isActiveMaintenanceRequest(request)) return false;
    const sameDoor = normalizedDoor && normalized(request.door ?? request.doorNumber) === normalizedDoor;
    const sameChassis = normalizedChassis && normalized(request.chassis ?? request.chassisNumber) === normalizedChassis;
    return Boolean(sameDoor || sameChassis);
  });
  return matching.find(isIdleVehicleRequest) || matching[0] || null;
}

export function activeRequestConflictMessage(conflict = {}, selectedDoor = "") {
  const door = String(selectedDoor || conflict.door || conflict.doorNumber || "this asset").trim();
  const reference = String(conflict.ref || conflict.reference || conflict.existingReference || "").trim();
  const requestText = reference ? ` under request ${reference}` : "";
  if (conflict.idleApprovalPending || isIdleVehicleRequest(conflict)) return `Door ${door} has a pending idle approval${requestText}. Resolve the idle approval before creating a new breakdown request.`;
  return `Door ${door} is already off road / under maintenance${requestText}. A second request cannot be created until the active request is closed.`;
}
