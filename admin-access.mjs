export const ADMIN_MASTER_OPTIONS = [
  "Users & employees",
  "Equipment master",
  "Breakdown master",
  "Repair type master",
  "Region master",
  "Vehicle transfers",
  "Hierarchy master",
  "OEM master",
  "Privilege",
];

export const ADMIN_TAB_OPTIONS = [
  "Dashboard",
  "WhatsApp Integration",
  "Reports",
  "Audit Trail",
];

export function accessSelection(record = {}, key, options = []) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return null;
  const raw = Array.isArray(record[key]) ? record[key] : String(record[key] || "").split(/\s*[|,]\s*/);
  const allowed = new Set(options);
  return [...new Set(raw.map((value) => String(value).trim()).filter((value) => allowed.has(value)))];
}

export function accessAllows(selection, name) {
  return selection == null || selection.includes(name);
}

export function adminAccessPermissions(user = {}) {
  return {
    masterAccess: accessSelection(user, "masterAccess", ADMIN_MASTER_OPTIONS),
    tabAccess: accessSelection(user, "tabAccess", ADMIN_TAB_OPTIONS),
  };
}
