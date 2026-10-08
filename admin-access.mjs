import { isCdirMaster } from "./cdir-masters.mjs";
import { ibossAccountsEligible } from './iboss-access.mjs';

export const ADMIN_MASTER_OPTIONS = [
  "Users & employees",
  "Equipment master",
  "Breakdown master",
  "Repair type master",
  "Breakdown Sub-Category",
  "Region master",
  "Shift Master",
  "Delayed Reason",
  "Vehicle transfers",
  "Hierarchy master",
  "OEM master",
];

export const ADMIN_TAB_OPTIONS = [
  "Dashboard",
  "CD",
  "Masters",
  "WhatsApp Integration",
  "Reports",
  "Audit Trail",
  "Tickets",
];
ADMIN_TAB_OPTIONS.push("Tender");
export const ADMIN_DEFAULT_TAB_OPTIONS = ADMIN_TAB_OPTIONS.filter(tab=>tab!=="Tender");
export const ADMIN_REPORT_OPTIONS = [
  "Reports",
  "General Report",
  "Production report",
  "Maintenance report",
  "MIS Report",
  "Vehicle History Report",
  "Stock Statement",
  "Purchase Order",
  "GRN Register",
  "PO-GRN Reconciliation",
  "Accounts",
];

export const ADMIN_SUBMENU_OPTIONS = {
  Dashboard: {field: "dashboardAccess", label: "Visible dashboard menus", options: ["Dashboard"]},
  Masters: {field: "masterAccess", label: "Visible masters", options: ADMIN_MASTER_OPTIONS},
  "WhatsApp Integration": {field: "whatsappAccess", label: "Visible WhatsApp menus", options: ["Meta API setup", "Daily site-wise report", "Daily OEM report", "WhatsApp alert history"]},
  Reports: {field: "reportAccess", label: "Visible report menus", options: ADMIN_REPORT_OPTIONS},
  "Audit Trail": {field: "auditAccess", label: "Visible audit menus", options: ["Audit Trail"]},
  Tickets: {field: "ticketAccess", label: "Visible ticket menus", options: ["Tickets"]},
};

export function accessSelection(record = {}, key, options = []) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return null;
  const raw = Array.isArray(record[key]) ? record[key] : String(record[key] || "").split(/\s*[|,]\s*/);
  const allowed = new Set(options);
  return [...new Set(raw.map((value) => String(value).trim()).filter((value) => allowed.has(value)))];
}

// Directory is a core account-scoped page. Keep it in any explicitly stored
// desktop/mobile menu selection without broadening any other permission.
export function ensureDirectoryMenuAccess(record = {}) {
  const next = {...record};
  const desktopAccount=/super|admin/i.test(String(next.userType||''))||String(next.userGroup||'').trim()==='User';
  const keys=desktopAccount?["tabAccess","mobileTabAccess"]:["desktopUserMenuAccess","mobileUserMenuAccess"];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    const original = next[key];
    const values = (Array.isArray(original) ? original : String(original || "").split(/\s*[|,]\s*/))
      .map((value) => String(value).trim())
      .filter(Boolean);
    const required = [...new Set([...values,"CD"])];
    next[key] = Array.isArray(original) ? required : required.join(" | ");
  }
  return next;
}

export function accessAllows(selection, name) {
  return selection == null || selection.includes(name);
}

export function masterAccessAllows(permissions = {}, name, selectionKey = "masterAccess") {
  if(permissions.hrDirectoryMasters===true)return isCdirMaster(name);
    // C-Dir masters hold staff contact details: Admin and Super Admin only, never Managers.
  if (isCdirMaster(name)) return normalizeAdminLevel(permissions.adminLevel) !== "Manager";
  if (name === "Delayed Reason" && normalizeAdminLevel(permissions.adminLevel) !== "Manager") return true;
  if (name === "Shift Master" && normalizeAdminLevel(permissions.adminLevel) !== "Manager") return true;
  // Added after most accounts saved their "Visible masters" list, so Admin and Super Admin always see it.
  if (name === "Breakdown Sub-Category" && normalizeAdminLevel(permissions.adminLevel) !== "Manager") return true;
  return accessAllows(permissions[selectionKey], name);
}

/** Read-only organisation pages in the Administration menu (Admin and Super Admin only). */
export const ORGANISATION_PAGE_NAMES = ["Access structure", "Hierarchy levels", "Reporting structure", "People by designation"];
export const MANAGER_ROLE_OPTIONS = ["Project Manager", "Production Manager", "Maintenance Manager", "MIS Manager"];

export function normalizeAdminLevel(value = "") {
  const level = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (level === "super admin") return "Super Admin";
  if (level === "manager") return "Manager";
  return "Admin";
}

export function managerRoleSelection(value) {
  const raw=Array.isArray(value)?value:String(value||"").split(/\s*[|,]\s*/);
  return [...new Set(raw.map((role)=>String(role).trim()).filter((role)=>MANAGER_ROLE_OPTIONS.includes(role)))];
}

export function adminAccessPermissions(user = {}) {
  const adminLevel = normalizeAdminLevel(user.adminLevel);
  const selectedTabs = accessSelection(user, "tabAccess", ADMIN_TAB_OPTIONS);
  const ticketAccount = adminLevel === "Manager" || ["Admin", "Manager"].includes(String(user.adminLevel || "").trim()) || String(user.userType || "").toLowerCase().includes("super");
  const requiredTabs = ticketAccount ? ["Tickets"] : [];
  const tabAccess = [...new Set([...(selectedTabs ?? ADMIN_DEFAULT_TAB_OPTIONS), ...requiredTabs,"CD"])];
  const mobileSelection=(field,options,fallback)=>accessSelection(user,`mobile${field[0].toUpperCase()}${field.slice(1)}`,options)??fallback;
  const managerRoles=managerRoleSelection(user.managerRole);
  const enabled=value=>value===true||/^(true|yes|1|on)$/i.test(String(value||'').trim());
  const desktopManagerCreateRequest=adminLevel==='Manager'&&enabled(user.desktopManagerCreateRequest);
  const mobileManagerCreateRequest=adminLevel==='Manager'&&enabled(user.mobileManagerCreateRequest);
  // Either view may authorize creation; each responsive view exposes only its own grant.
  return {
    createRequests: adminLevel!=='Manager'||desktopManagerCreateRequest||mobileManagerCreateRequest,
    desktopManagerCreateRequest,
    mobileManagerCreateRequest,
    adminLevel,
    ibossAccounts: ibossAccountsEligible(user),
    managerRole: managerRoles[0]||"",
    managerRoles,
    masterAccess: accessSelection(user, "masterAccess", ADMIN_MASTER_OPTIONS),
    tabAccess,
    dashboardAccess: accessSelection(user, "dashboardAccess", ADMIN_SUBMENU_OPTIONS.Dashboard.options),
    whatsappAccess: accessSelection(user, "whatsappAccess", ADMIN_SUBMENU_OPTIONS["WhatsApp Integration"].options),
    reportAccess: accessSelection(user, "reportAccess", ADMIN_SUBMENU_OPTIONS.Reports.options),
    auditAccess: accessSelection(user, "auditAccess", ADMIN_SUBMENU_OPTIONS["Audit Trail"].options),
    ticketAccess: accessSelection(user, "ticketAccess", ADMIN_SUBMENU_OPTIONS.Tickets.options),
    mobileMasterAccess: mobileSelection("masterAccess",ADMIN_MASTER_OPTIONS,accessSelection(user,"masterAccess",ADMIN_MASTER_OPTIONS)),
    mobileTabAccess: [...new Set([...mobileSelection("tabAccess",ADMIN_TAB_OPTIONS,tabAccess),"CD"])],
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
    desktopManagerCreateRequest:permissions.mobileManagerCreateRequest===true,
    masterAccess:permissions.mobileMasterAccess??permissions.masterAccess,
    tabAccess:permissions.mobileTabAccess??permissions.tabAccess,
    dashboardAccess:permissions.mobileDashboardAccess??permissions.dashboardAccess,
    whatsappAccess:permissions.mobileWhatsappAccess??permissions.whatsappAccess,
    reportAccess:permissions.mobileReportAccess??permissions.reportAccess,
    auditAccess:permissions.mobileAuditAccess??permissions.auditAccess,
    ticketAccess:permissions.mobileTicketAccess??permissions.ticketAccess,
  };
}
