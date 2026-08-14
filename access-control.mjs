export const MOBILE_ROLE_OPTIONS = [
  "Production User",
  "Maintenance User",
  "Maintenance Head",
  "MIS User",
];

const permissionFields = ["read", "edit", "delete", "verify", "print"];

const rolePolicies = {
  "Production User": {
    readRequests: true,
    createRequest: true,
    viewAllRequests: false,
    viewReports: false,
    printReports: false,
    viewEquipment: true,
  },
  "Maintenance User": {
    readRequests: true,
    createRequest: true,
    viewAllRequests: false,
    viewReports: false,
    printReports: false,
    viewEquipment: true,
  },
  "Maintenance Head": {
    readRequests: true,
    createRequest: false,
    viewAllRequests: true,
    viewReports: true,
    printReports: true,
    viewEquipment: true,
  },
  "MIS User": {
    readRequests: true,
    createRequest: false,
    viewAllRequests: true,
    viewReports: true,
    printReports: true,
    viewEquipment: false,
  },
};

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

export function normalizeMobileRole(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!text) return "";
  if (text.includes("production")) return "Production User";
  if (text.includes("maintenance") && text.includes("head")) return "Maintenance Head";
  if (text.includes("maintenance")) return "Maintenance User";
  if (text === "mis" || text.includes("mis user") || text.includes("management information")) return "MIS User";
  return "";
}

export function resolveAccessProfile({ user = {}, privilege = {} } = {}) {
  const userType = normalizeAccountType(
    user.userType || user.accessType || user.accountType || user.role || privilege.accessType,
  );
  if (userType === "super") {
    return {
      userType: "Super User",
      assignedRole: "Super User",
      permissions: {
        viewDashboard: true,
        readRequests: true,
        createRequest: true,
        viewAllRequests: true,
        viewReports: true,
        printReports: true,
        viewEquipment: true,
        manageMasters: true,
      },
    };
  }

  const assignedRole = normalizeMobileRole(
    privilege.userGroup || user.mobileRole || user.assignedRole || user.department || user.userGroup || user.role,
  );
  const policy = rolePolicies[assignedRole];
  if (userType !== "mobile" || !policy) {
    return {
      userType: userType === "mobile" ? "Mobile User" : "",
      assignedRole: "",
      permissions: {
        viewDashboard: false,
        readRequests: false,
        createRequest: false,
        viewAllRequests: false,
        viewReports: false,
        printReports: false,
        viewEquipment: false,
        manageMasters: false,
      },
    };
  }

  const hasExplicitPermissions = permissionFields.some((field) => permissionEnabled(privilege[field]));
  const canRead = !hasExplicitPermissions || permissionEnabled(privilege.read);
  const canEdit = !hasExplicitPermissions || permissionEnabled(privilege.edit);
  const canPrint = !hasExplicitPermissions || permissionEnabled(privilege.print);
  return {
    userType: "Mobile User",
    assignedRole,
    permissions: {
      viewDashboard: true,
      readRequests: policy.readRequests && canRead,
      createRequest: policy.createRequest && canEdit,
      viewAllRequests: policy.viewAllRequests && canRead,
      viewReports: policy.viewReports && canRead,
      printReports: policy.printReports && canPrint,
      // A user who can create a request needs to select the live equipment
      // record even when their request list is intentionally read-restricted.
      viewEquipment: policy.viewEquipment && (canRead || canEdit),
      manageMasters: false,
    },
  };
}

export function userLoginCandidates(record = {}) {
  const login = String(record.login || "").trim().toLowerCase();
  const firstName = String(record.employee || "").trim().split(/\s+/)[0].toLowerCase();
  return [...new Set([login, firstName].filter(Boolean))];
}
