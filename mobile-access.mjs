export const MOBILE_USER_ROLES = [
  "Production User",
  "Maintenance User",
  "MIS User",
];

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
  return "";
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
  const accessList=(key,fallback=[])=>Object.hasOwn(user,key)
    ? [...new Set(String(user[key]||"").split(/\s*[|,]\s*/).map((value)=>value.trim()).filter(Boolean))]
    : fallback;
  const roleRequestMenus=assignedRole==="Production User"
    ? ["View requests","Create request","Closed history"]
    : maintenance
      ? ["View requests","Create request","Close request form","Closed history"]
      : ["View requests","Verify closed requests","Closed history"];
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
      viewEquipment: assignedRole === "Production User" || maintenance,
      viewRepairTypes: assignedRole === "Production User" || assignedRole === "Maintenance User",
      desktopUserMenuAccess:accessList("desktopUserMenuAccess",["Requests","Tickets"]),
      desktopUserRequestAccess:[...new Set([...accessList("desktopUserRequestAccess",roleRequestMenus),"Closed history"])],
      mobileUserMenuAccess:accessList("mobileUserMenuAccess",accessList("desktopUserMenuAccess",["Requests","Tickets"])),
      mobileUserRequestAccess:[...new Set([...accessList("mobileUserRequestAccess",accessList("desktopUserRequestAccess",roleRequestMenus)),"Closed history"])],
    },
  };
}
import {adminAccessPermissions} from "./admin-access.mjs";
