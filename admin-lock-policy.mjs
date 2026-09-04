export const ADMIN_LOCK_TICKET_CUTOFF = "2026-08-28T00:00:00+05:30";
export const ADMIN_LOCK_HOURS = 72;

export function isTrueSuperAdmin(value = {}) {
  return String(value?.adminLevel || value || "").trim().toLowerCase().replace(/\s+/g," ") === "super admin";
}

export function isLockableAdmin(value = {}) {
  const level = String(value?.adminLevel || value || "").trim();
  return level === "Admin" || level === "Manager";
}

