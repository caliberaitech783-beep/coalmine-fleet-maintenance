// Maintenance completion and the vehicle's subsequent idle period are separate.
export function isIdleVehicleRequest(request = {}) {
  const status = String(request.status || '').trim().toLowerCase();
  return ['idle', 'ideal'].includes(status)
    || (status === 'closed' && (typeof request.vehicleIdle === 'boolean' ? request.vehicleIdle : Boolean(request.idealRequestedAt || request.idleRequestedAt) && !request.idealApprovedAt));
}
