function normalized(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

export function isActiveMaintenanceRequest(request = {}) {
  return normalized(request.status) !== "closed";
}

export function findActiveRequestConflict(requests = [], { door = "", chassis = "" } = {}) {
  const normalizedDoor = normalized(door);
  const normalizedChassis = normalized(chassis);
  if (!normalizedDoor && !normalizedChassis) return null;

  return requests.find((request) => {
    if (!isActiveMaintenanceRequest(request)) return false;
    const sameDoor = normalizedDoor && normalized(request.door ?? request.doorNumber) === normalizedDoor;
    const sameChassis = normalizedChassis && normalized(request.chassis ?? request.chassisNumber) === normalizedChassis;
    return Boolean(sameDoor || sameChassis);
  }) || null;
}

export function activeRequestConflictMessage(conflict = {}, selectedDoor = "") {
  const door = String(selectedDoor || conflict.door || conflict.doorNumber || "this asset").trim();
  const reference = String(conflict.ref || conflict.reference || conflict.existingReference || "").trim();
  const requestText = reference ? ` under request ${reference}` : "";
  return `Door ${door} is already off road / under maintenance${requestText}. A second request cannot be created until the active request is closed.`;
}
