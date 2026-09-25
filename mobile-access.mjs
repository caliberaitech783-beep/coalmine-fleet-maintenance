export const MOBILE_USER_ROLES = [
  "Production User",
  "Maintenance User",
  "MIS User",
  "General User",
];

export const GENERAL_USER_ROLE = "General User";
export const GENERAL_USER_MENU_OPTIONS = [
  "Dashboard",
  "Masters",
  "WhatsApp Integration",
  "Requests",
  "Reports",
  "Audit Trail",
  "Tickets",
];
export const GENERAL_USER_DEFAULT_MENUS = [];

export function generalUserMenuSelection(record = {}, view = "desktop") {
  const field = `${view}UserMenuAccess`;
  if (!Object.hasOwn(record, field)) {
    return view === "mobile" ? generalUserMenuSelection(record, "desktop") : [...GENERAL_USER_DEFAULT_MENUS];
  }
  const values = Array.isArray(record[field]) ? record[field] : String(record[field] || "").split(/\s*[|,]\s*/);
  return [...new Set(values.map((value) => String(value).trim()).filter((value) => GENERAL_USER_MENU_OPTIONS.includes(value)))];
}

// API access is the union of the configured desktop and mobile menus.
export function generalUserCanAccessMenu(session = {}, menu) {
  if (session.assignedRole !== GENERAL_USER_ROLE) return true;
  return ["desktop", "mobile"].some((view) => generalUserMenuSelection(session.permissions || {}, view).includes(menu));
}

export function permissionEnabled(value) {
  return value === true || ["true", "yes", "1", "enabled", "checked"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}

export function normalizeAccountType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text.includes("super") || text === "admin" || text.includes("admin user")) return "super";
  if (text.includes("mobile") || text.includes("normal")) return "mobile";
  return "";
}

export function normalizeMobileUserRole(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[\-_]+/g, " ");
  if (text.includes("production")) return "Production User";
  if (text.includes("head")) return "";
  if (text.includes("maintenance")) return "Maintenance User";
  if (text === "mis" || text.includes("mis user") || text.includes("management information")) return "MIS User";
  if (text === "general" || text === "general user") return GENERAL_USER_ROLE;
  return "";
}

// The MIS request submenu was previously labelled "Verify closed requests".
// That phrase is rejected by the production edge firewall when it appears in
// a request body, so the option is now stored and shown as "MIS verification".
// Stored records that still carry the old label keep working through the alias.
export const MIS_VERIFICATION_MENU = "MIS verification";
const LEGACY_REQUEST_MENU_LABELS = new Map([["verify closed requests", MIS_VERIFICATION_MENU]]);

export function normalizeRequestMenuLabel(value) {
  const label = String(value || "").trim();
  return LEGACY_REQUEST_MENU_LABELS.get(label.toLowerCase()) || label;
}

export function normalizeUserAccessLabels(record = {}) {
  const next = { ...record };
  for (const key of ["desktopUserRequestAccess", "mobileUserRequestAccess"]) {
    if (typeof next[key] !== "string" || !next[key].trim()) continue;
    next[key] = [...new Set(next[key].split(/\s*[|,]\s*/).map(normalizeRequestMenuLabel).filter(Boolean))].join(" | ");
  }
  return next;
}

export function userLoginCandidates(record = {}) {
  const login = String(record.login || "").trim().toLowerCase();
  const firstName = String(record.employee || "").trim().split(/\s+/)[0].toLowerCase();
  return [...new Set([login, firstName].filter(Boolean))];
}

// Restrict password verification to records that could actually match the
// submitted login.  Verifying an scrypt hash is intentionally expensive; doing
// it for every employee row made sign-in appear to hang when the master grew.
export function loginRecordCandidates(rows = [], username = "") {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized) return [];
  return rows.filter((row) => userLoginCandidates(row?.record_data || row).includes(normalized));
}

export function resolveMobileAccess({ user = {}, privilege = {} } = {}) {
  const accountType = normalizeAccountType(
    user.userType || user.accessType || user.accountType || user.role || privilege.accessType,
  );
  if (accountType === "super") {
    const adminAccess = adminAccessPermissions(user);
    return {
      sessionRole: "super",
      userType: "Super User",
      assignedRole: "Super User",
      permissions: {
        readRequests: true,
        viewAllRequests: true,
        createRequests: true,
        editRequests: true,
        deleteRequests: true,
        closeRequests: true,
        verifyRequests: true,
        viewEquipment: true,
        viewRepairTypes: true,
        ...adminAccess,
      },
    };
  }

  const assignedRole = normalizeMobileUserRole(
    user.userGroup || user.mobileRole || user.assignedRole || user.department || privilege.userGroup,
  );
  if (accountType !== "mobile" || !assignedRole) {
    return {
      sessionRole: "normal",
      userType: accountType === "mobile" ? "Mobile User" : "",
      assignedRole: "",
      permissions: {},
    };
  }

  const maintenance = assignedRole === "Maintenance User";
  if (assignedRole === GENERAL_USER_ROLE) {
    const desktopUserMenuAccess = generalUserMenuSelection(user);
    const mobileUserMenuAccess = generalUserMenuSelection(user, "mobile");
    const hasMenu = (menu) => desktopUserMenuAccess.includes(menu) || mobileUserMenuAccess.includes(menu);
    const requestMenus = (view) => {
      const field = `${view}UserRequestAccess`;
      if (!Object.hasOwn(user, field)) return view === "mobile" ? requestMenus("desktop") : ["View requests", "Closed history"];
      const values = Array.isArray(user[field]) ? user[field] : String(user[field] || "").split(/\s*[|,]\s*/);
      return [...new Set(values.map(normalizeRequestMenuLabel).filter((value) => ["View requests", "Closed history"].includes(value)))];
    };
    const viewFleetData = ["Dashboard", "Requests", "Reports"].some(hasMenu);
    return {
      sessionRole: "normal",
      userType: "Mobile User",
      assignedRole,
      permissions: {
        readRequests: hasMenu("Requests") || hasMenu("Reports"),
        viewDashboardRequests: hasMenu("Dashboard"),
        viewAllRequests: true,
        createRequests: false,
        editRequests: false,
        deleteRequests: false,
        closeRequests: false,
        verifyRequests: false,
        viewEquipment: viewFleetData,
        viewRepairTypes: viewFleetData,
        desktopUserMenuAccess,
        mobileUserMenuAccess,
        desktopUserRequestAccess: desktopUserMenuAccess.includes("Requests") ? requestMenus("desktop") : [],
        mobileUserRequestAccess: mobileUserMenuAccess.includes("Requests") ? requestMenus("mobile") : [],
      },
    };
  }
  const accessList=(key,fallback=[])=>Object.hasOwn(user,key)
    ? [...new Set(String(user[key]||"").split(/\s*[|,]\s*/).map(normalizeRequestMenuLabel).filter(Boolean))]
    : fallback;
  const roleRequestMenus=assignedRole==="Production User"
    ? ["View requests","Create request","Closed history"]
    : maintenance
      ? ["View requests","Create request","Close request form","Closed history"]
      : ["View requests",MIS_VERIFICATION_MENU,"Closed history"];
  return {
    sessionRole: "normal",
    userType: "Mobile User",
    assignedRole,
    permissions: {
      readRequests: true,
      viewAllRequests: assignedRole !== "Production User",
      createRequests: assignedRole === "Production User" || maintenance,
      editRequests: maintenance,
      deleteRequests: maintenance && permissionEnabled(Object.hasOwn(user, "delete") ? user.delete : privilege.delete),
      closeRequests: maintenance,
      verifyRequests: assignedRole === "MIS User",
      // Every operational role receives the shared fleet dashboard. Equipment
      // is site-scoped by the masters endpoint; repair types are reference data.
      viewEquipment: true,
      viewRepairTypes: true,
      desktopUserMenuAccess:accessList("desktopUserMenuAccess",["Requests","Tickets"]),
      desktopUserRequestAccess:[...new Set([...accessList("desktopUserRequestAccess",roleRequestMenus),"Closed history"])],
      mobileUserMenuAccess:accessList("mobileUserMenuAccess",accessList("desktopUserMenuAccess",["Requests","Tickets"])),
      mobileUserRequestAccess:[...new Set([...accessList("mobileUserRequestAccess",accessList("desktopUserRequestAccess",roleRequestMenus)),"Closed history"])],
    },
  };
}
import {adminAccessPermissions} from "./admin-access.mjs";
