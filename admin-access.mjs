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
  "Tickets",
];

export const ADMIN_SUBMENU_OPTIONS = {
  Dashboard: {field: "dashboardAccess", label: "Visible dashboard menus", options: ["Dashboard"]},
  Masters: {field: "masterAccess", label: "Visible masters", options: ADMIN_MASTER_OPTIONS},
  "WhatsApp Integration": {field: "whatsappAccess", label: "Visible WhatsApp menus", options: ["Daily site-wise report", "Daily OEM report", "WhatsApp alert history"]},
  Reports: {field: "reportAccess", label: "Visible report menus", options: ["Reports"]},
  "Audit Trail": {field: "auditAccess", label: "Visible audit menus", options: ["Audit Trail"]},
  Tickets: {field: "ticketAccess", label: "Visible ticket menus", options: ["Tickets"]},
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
  const adminLevel = String(user.adminLevel || "Admin").trim() === "Manager" ? "Manager" : "Admin";
  const selectedTabs = accessSelection(user, "tabAccess", ADMIN_TAB_OPTIONS);
  const ticketAccount = adminLevel === "Manager" || ["Admin", "Manager"].includes(String(user.adminLevel || "").trim()) || String(user.userType || "").toLowerCase().includes("super");
  const tabAccess = ticketAccount && selectedTabs != null
    ? [...new Set([...selectedTabs, "Tickets"])]
    : selectedTabs;
  const mobileSelection=(field,options,fallback)=>accessSelection(user,`mobile${field[0].toUpperCase()}${field.slice(1)}`,options)??fallback;
  return {
    adminLevel,
    managerRole: ["Production Manager", "Maintenance Manager", "MIS Manager"].includes(String(user.managerRole || "").trim()) ? String(user.managerRole).trim() : "",
    masterAccess: accessSelection(user, "masterAccess", ADMIN_MASTER_OPTIONS),
    tabAccess,
    dashboardAccess: accessSelection(user, "dashboardAccess", ADMIN_SUBMENU_OPTIONS.Dashboard.options),
    whatsappAccess: accessSelection(user, "whatsappAccess", ADMIN_SUBMENU_OPTIONS["WhatsApp Integration"].options),
    reportAccess: accessSelection(user, "reportAccess", ADMIN_SUBMENU_OPTIONS.Reports.options),
    auditAccess: accessSelection(user, "auditAccess", ADMIN_SUBMENU_OPTIONS["Audit Trail"].options),
    ticketAccess: accessSelection(user, "ticketAccess", ADMIN_SUBMENU_OPTIONS.Tickets.options),
    mobileMasterAccess: mobileSelection("masterAccess",ADMIN_MASTER_OPTIONS,accessSelection(user,"masterAccess",ADMIN_MASTER_OPTIONS)),
    mobileTabAccess: mobileSelection("tabAccess",ADMIN_TAB_OPTIONS,tabAccess),
    mobileDashboardAccess: mobileSelection("dashboardAccess",ADMIN_SUBMENU_OPTIONS.Dashboard.options,accessSelection(user,"dashboardAccess",ADMIN_SUBMENU_OPTIONS.Dashboard.options)),
    mobileWhatsappAccess: mobileSelection("whatsappAccess",ADMIN_SUBMENU_OPTIONS["WhatsApp Integration"].options,accessSelection(user,"whatsappAccess",ADMIN_SUBMENU_OPTIONS["WhatsApp Integration"].options)),
    mobileReportAccess: mobileSelection("reportAccess",ADMIN_SUBMENU_OPTIONS.Reports.options,accessSelection(user,"reportAccess",ADMIN_SUBMENU_OPTIONS.Reports.options)),
    mobileAuditAccess: mobileSelection("auditAccess",ADMIN_SUBMENU_OPTIONS["Audit Trail"].options,accessSelection(user,"auditAccess",ADMIN_SUBMENU_OPTIONS["Audit Trail"].options)),
    mobileTicketAccess: mobileSelection("ticketAccess",ADMIN_SUBMENU_OPTIONS.Tickets.options,accessSelection(user,"ticketAccess",ADMIN_SUBMENU_OPTIONS.Tickets.options)),
  };
}

export function navigationPermissionsForView(permissions={},mobile=false){
  if(!mobile)return permissions;
  return {...permissions,
    masterAccess:permissions.mobileMasterAccess??permissions.masterAccess,
    tabAccess:permissions.mobileTabAccess??permissions.tabAccess,
    dashboardAccess:permissions.mobileDashboardAccess??permissions.dashboardAccess,
    whatsappAccess:permissions.mobileWhatsappAccess??permissions.whatsappAccess,
    reportAccess:permissions.mobileReportAccess??permissions.reportAccess,
    auditAccess:permissions.mobileAuditAccess??permissions.auditAccess,
    ticketAccess:permissions.mobileTicketAccess??permissions.ticketAccess,
  };
}
