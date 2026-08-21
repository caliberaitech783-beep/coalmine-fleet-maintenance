export const ADMIN_MASTER_OPTIONS = [
  "Users & employees",
  "Equipment master",
  "Breakdown master",
  "Repair type master",
  "Region master",
  "Vehicle transfers",
  "Hierarchy master",
  "OEM master",
];

export const ADMIN_TAB_OPTIONS = [
  "Dashboard",
  "Masters",
  "WhatsApp Integration",
  "Reports",
  "Audit Trail",
];

export const ADMIN_SUBMENU_OPTIONS = {
  Dashboard: {field: "dashboardAccess", label: "Visible dashboard menus", options: ["Dashboard"]},
  Masters: {field: "masterAccess", label: "Visible masters", options: ADMIN_MASTER_OPTIONS},
  "WhatsApp Integration": {field: "whatsappAccess", label: "Visible WhatsApp menus", options: ["Daily site-wise report", "Daily OEM report", "WhatsApp alert history"]},
  Reports: {field: "reportAccess", label: "Visible report menus", options: ["Reports"]},
  "Audit Trail": {field: "auditAccess", label: "Visible audit menus", options: ["Audit Trail"]},
};

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
    adminLevel: String(user.adminLevel || "Admin").trim() === "Manager" ? "Manager" : "Admin",
    managerRole: ["Production Manager", "Maintenance Manager", "MIS Manager"].includes(String(user.managerRole || "").trim()) ? String(user.managerRole).trim() : "",
    masterAccess: accessSelection(user, "masterAccess", ADMIN_MASTER_OPTIONS),
    tabAccess: accessSelection(user, "tabAccess", ADMIN_TAB_OPTIONS),
    dashboardAccess: accessSelection(user, "dashboardAccess", ADMIN_SUBMENU_OPTIONS.Dashboard.options),
    whatsappAccess: accessSelection(user, "whatsappAccess", ADMIN_SUBMENU_OPTIONS["WhatsApp Integration"].options),
    reportAccess: accessSelection(user, "reportAccess", ADMIN_SUBMENU_OPTIONS.Reports.options),
    auditAccess: accessSelection(user, "auditAccess", ADMIN_SUBMENU_OPTIONS["Audit Trail"].options),
  };
}
