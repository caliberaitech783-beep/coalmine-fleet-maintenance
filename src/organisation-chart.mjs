/**
 * Organisation chart: a read-only picture of who is who, built live from the
 * Users & employees, Privilege and Hierarchy masters. Three trees:
 *  1. access  - account type, access level, manager roles, mobile user groups;
 *  2. levels  - the Hierarchy master escalation levels as configured;
 *  3. people  - every designation with the named people who hold it.
 * Pure functions only, so the page and the tests share one model.
 */
import { resolveMobileAccess, userLoginCandidates } from "../mobile-access.mjs";
import { whatsAppRecipientRole } from "../whatsapp-recipient-policy.mjs";

export const ORGANISATION_CHART_PAGE = "Organisation chart";

/** Display order of the hierarchy designations, matching the Hierarchy master defaults. */
export const CHART_DESIGNATIONS = [
  { key: "superAdmin", label: "Super Admin", section: "Administration", level: 1 },
  { key: "admin", label: "Admin", section: "Administration", level: 1 },
  { key: "director", label: "Director's", section: "Management", level: 1 },
  { key: "projectManager", label: "Project Manager (P.M)", section: "Management", level: 2 },
  { key: "productionManager", label: "Production Manager", section: "Production Dept.", level: 3 },
  { key: "productionSupervisor", label: "Production Incharge / Supervisor", section: "Production Dept.", level: 4 },
  { key: "maintenanceManager", label: "Maintenance Manager", section: "Maintenance Dept.", level: 3 },
  { key: "maintenanceSupervisor", label: "Maintenance Incharge / Supervisor", section: "Maintenance Dept.", level: 4 },
  { key: "misManager", label: "MIS Manager", section: "MIS Dept.", level: 3 },
  { key: "misSupervisor", label: "MIS Incharge / Supervisor", section: "MIS Dept.", level: 4 },
  { key: "oemNationalHead", label: "National Head", section: "OEM", level: 1 },
  { key: "oemRegionalHead", label: "Regional Head / Zonal Head", section: "OEM", level: 2 },
  { key: "oemAreaServiceEngineer", label: "Area Service engineer", section: "OEM", level: 3 },
  { key: "oemServiceEngineer", label: "Service Engineer / Site Service Engineer", section: "OEM", level: 4 },
];
export const CHART_SECTIONS = ["Administration", "Management", "Production Dept.", "Maintenance Dept.", "MIS Dept.", "OEM"];
export const MANAGER_ROLE_ORDER = ["Project Manager", "Production Manager", "Maintenance Manager", "MIS Manager"];
export const MOBILE_GROUP_ORDER = ["Production User", "Maintenance User", "MIS User"];

const clean = (value) => String(value ?? "").trim();
const words = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");
const includesAny = (text, needles) => needles.some((needle) => text.includes(needle));

/** The designation named by a piece of text (job title, department, role), or "". */
export function designationFromText(text = "", managerRoles = []) {
  const fields = words(text);
  if (!fields) return "";
  if (fields.includes("director")) return "director";
  if (includesAny(fields, ["project manager", "p.m", "pm manager"])) return "projectManager";
  if (includesAny(fields, ["national head"])) return "oemNationalHead";
  if (includesAny(fields, ["regional head", "zonal head"])) return "oemRegionalHead";
  if (includesAny(fields, ["area service engineer"])) return "oemAreaServiceEngineer";
  if (includesAny(fields, ["site service engineer", "service engineer"])) return "oemServiceEngineer";
  if (includesAny(fields, ["production manager"]) || managerRoles.includes("Production Manager")) return "productionManager";
  if (fields.includes("production") && includesAny(fields, ["incharge", "supervisor"])) return "productionSupervisor";
  if (includesAny(fields, ["maintenance manager"]) || managerRoles.includes("Maintenance Manager")) return "maintenanceManager";
  if (fields.includes("maintenance") && includesAny(fields, ["incharge", "supervisor"])) return "maintenanceSupervisor";
  if (includesAny(fields, ["mis manager"]) || managerRoles.includes("MIS Manager")) return "misManager";
  if (fields.includes("mis") && includesAny(fields, ["incharge", "supervisor"])) return "misSupervisor";
  return "";
}

/**
 * The hierarchy designation a person holds on the chart. An explicit job title
 * (designation, department, role, level fields) always wins, so a Super Admin
 * who is also the Director appears under Director's. Everyone else follows the
 * same rules as the WhatsApp report flow (`flowDesignationForUser`); the test
 * suite checks the two agree.
 */
export function chartDesignationKey(user = {}, profile = resolveMobileAccess({ user })) {
  const explicit = designationFromText([user.designation, user.department, user.role, user.oemRole, user.hierarchyLevel, user.level].map(words).join(" "));
  if (explicit) return explicit;
  const managerRoles = profile?.permissions?.managerRoles || [];
  const fields = [user.level, user.hierarchyLevel, user.userGroup, user.adminLevel, user.designation, user.role, user.department, user.employee, user.name, user.oemRole, user.managerRole, managerRoles.join(" "), profile.assignedRole].map(words).join(" ");
  const adminLevel = words(user.adminLevel || profile?.permissions?.adminLevel);
  const policyRole = whatsAppRecipientRole(user, profile);
  if (policyRole === "superAdmin") return "superAdmin";
  if (policyRole === "director") return "director";
  if (adminLevel === "project manager") return "projectManager";
  const matched = designationFromText(fields, managerRoles);
  if (matched) return matched;
  if (policyRole === "manager") return "projectManager";
  if (adminLevel === "admin" || [user.designation, user.userGroup, user.role, profile.assignedRole].some((value) => words(value) === "admin")) return "admin";
  if (profile.assignedRole === "Production User") return "productionSupervisor";
  if (profile.assignedRole === "Maintenance User") return "maintenanceSupervisor";
  if (profile.assignedRole === "MIS User") return "misSupervisor";
  return "";
}

function privilegeForUser(privileges, user) {
  const candidates = new Set(userLoginCandidates(user).map(words));
  return privileges.find((row) => candidates.has(words(row?.username || row?.login))) || {};
}

const listText = (value) => (Array.isArray(value) ? value : String(value ?? "").split(/\s*[|,]\s*/)).map(clean).filter(Boolean);

/** One person as shown on the chart. */
export function chartPerson(user = {}, privileges = []) {
  const privilege = privilegeForUser(privileges, user);
  const profile = resolveMobileAccess({ user, privilege });
  const permissions = profile.permissions || {};
  const sites = listText(user.managerSites);
  return {
    name: clean(user.employee || user.name) || clean(user.login) || "Unnamed",
    login: clean(user.login),
    site: clean(user.site || user.location || user.currentLocation),
    region: clean(user.managerRegion),
    sites,
    userType: profile.userType || "",
    adminLevel: profile.userType === "Super User" ? permissions.adminLevel || "Admin" : "",
    managerRoles: permissions.managerRoles || [],
    assignedRole: profile.assignedRole || "",
    designationKey: chartDesignationKey(user, profile),
  };
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
const levelNumber = (value) => Number(String(value ?? "").replace(/[^0-9]/g, "")) || 0;

/** The three trees. `users`, `privileges`, `hierarchy` are the master records as loaded. */
export function buildOrganisationChart({ users = [], privileges = [], hierarchy = [] } = {}) {
  const people = users.map((user) => chartPerson(user, privileges)).sort(byName);
  const superUsers = people.filter((person) => person.userType === "Super User");
  const mobileUsers = people.filter((person) => person.userType === "Mobile User");
  const managers = superUsers.filter((person) => person.adminLevel === "Manager");
  const access = {
    superAdmins: superUsers.filter((person) => person.adminLevel === "Super Admin"),
    admins: superUsers.filter((person) => person.adminLevel === "Admin"),
    managerRoles: MANAGER_ROLE_ORDER.map((role) => ({ role, people: managers.filter((person) => person.managerRoles.includes(role)) })),
    managersWithoutRole: managers.filter((person) => !person.managerRoles.length),
    mobileGroups: MOBILE_GROUP_ORDER.map((group) => ({ group, people: mobileUsers.filter((person) => person.assignedRole === group) })),
    otherMobile: mobileUsers.filter((person) => !MOBILE_GROUP_ORDER.includes(person.assignedRole)),
    noAccess: people.filter((person) => !person.userType),
  };
  const rows = hierarchy.map((row) => ({
    section: clean(row?.section) || "Other",
    designation: clean(row?.designation),
    level: levelNumber(row?.level),
    schedule: clean(row?.schedule),
    reportAccess: listText(row?.reportAccess),
    siteAccess: listText(row?.siteAccess),
  })).filter((row) => row.designation);
  const sectionOrder = (section) => { const index = CHART_SECTIONS.indexOf(section); return index < 0 ? CHART_SECTIONS.length : index; };
  const levels = [...new Set(rows.map((row) => row.section))].sort((a, b) => sectionOrder(a) - sectionOrder(b) || a.localeCompare(b))
    .map((section) => ({ section, rows: rows.filter((row) => row.section === section).sort((a, b) => a.level - b.level || a.designation.localeCompare(b.designation)) }));
  const configured = (label) => rows.find((row) => words(row.designation) === words(label)) || null;
  const designations = CHART_DESIGNATIONS.map((designation) => ({
    ...designation,
    configured: configured(designation.label),
    people: people.filter((person) => person.designationKey === designation.key),
  }));
  const peopleTree = CHART_SECTIONS.map((section) => ({ section, designations: designations.filter((designation) => designation.section === section) }));
  const unassigned = people.filter((person) => !person.designationKey);
  return {
    people,
    access,
    levels,
    peopleTree,
    unassigned,
    summary: {
      people: people.length,
      superUsers: superUsers.length,
      managers: managers.length,
      mobileUsers: mobileUsers.length,
      designationsFilled: designations.filter((designation) => designation.people.length).length,
      hierarchyRows: rows.length,
      unassigned: unassigned.length,
    },
  };
}
