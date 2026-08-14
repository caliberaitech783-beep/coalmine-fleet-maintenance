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

export function resolveMobileAccess({ user = {}, privilege = {} } = {}) {
  const accountType = normalizeAccountType(
    user.userType || user.accessType || user.accountType || user.role || privilege.accessType,
  );
  if (accountType === "super") {
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
      },
    };
  }

  const assignedRole = normalizeMobileUserRole(
    privilege.userGroup || user.mobileRole || user.assignedRole || user.department || user.userGroup,
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
  return {
    sessionRole: "normal",
    userType: "Mobile User",
    assignedRole,
    permissions: {
      readRequests: true,
      viewAllRequests: assignedRole !== "Production User",
      createRequests: assignedRole === "Production User",
      editRequests: maintenance,
      deleteRequests: maintenance && permissionEnabled(privilege.delete),
      closeRequests: maintenance,
      verifyRequests: assignedRole === "MIS User",
      viewEquipment: assignedRole === "Production User",
    },
  };
}
