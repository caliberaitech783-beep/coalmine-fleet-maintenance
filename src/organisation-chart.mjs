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

/** The three read-only Masters pages built from this model (names shared with admin-access.mjs). */
import { ORGANISATION_PAGE_NAMES } from "../admin-access.mjs";
export { ORGANISATION_PAGE_NAMES };
export const ORGANISATION_PAGES = Object.freeze({ access: ORGANISATION_PAGE_NAMES[0], levels: ORGANISATION_PAGE_NAMES[1], reporting: ORGANISATION_PAGE_NAMES[2] });
export const ORGANISATION_CHART_PAGE = ORGANISATION_PAGES.reporting;
/** Departments are always shown in this order. */
export const DEPARTMENT_ORDER = Object.freeze(["Production", "Maintenance", "MIS"]);

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
    superiors: listText(user.superior),
  };
}

const DEPARTMENT_OF = {
  productionManager: "Production", productionSupervisor: "Production",
  maintenanceManager: "Maintenance", maintenanceSupervisor: "Maintenance",
  misManager: "MIS", misSupervisor: "MIS",
};
const MANAGER_KEYS = ["productionManager", "maintenanceManager", "misManager"];
const SUPERVISOR_KEYS = ["productionSupervisor", "maintenanceSupervisor", "misSupervisor"];
const ALL_SITES = "All sites";

/** The sites a person belongs to: manager site list, else their own location. */
export function personSites(person = {}) {
  const sites = (person.sites || []).length ? person.sites : person.site ? [person.site] : [];
  return [...new Set(sites.map(clean).filter(Boolean))];
}

/**
 * Reporting lines, site-wise, from the Superior field of Users & employees.
 * Directors sit on top. Each site shows its Project Manager(s), the department
 * managers under them and the incharges / supervisors under each manager.
 * A person whose Superior is empty or unknown is placed by designation and site
 * and flagged as inferred, so the chart never loses anyone.
 */
export function buildReportingLines(people = []) {
  const byKey = new Map();
  people.forEach((person) => {
    [person.login, person.name].map(words).filter(Boolean).forEach((key) => { if (!byKey.has(key)) byKey.set(key, person); });
  });
  const resolve = (text) => byKey.get(words(text)) || null;
  const directors = people.filter((person) => person.designationKey === "director");
  const pms = people.filter((person) => person.designationKey === "projectManager");
  const managers = people.filter((person) => MANAGER_KEYS.includes(person.designationKey));
  const supervisors = people.filter((person) => SUPERVISOR_KEYS.includes(person.designationKey));
  // A candidate superior covers the person when they share a site; a superior with
  // no site list (e.g. a PM over all sites) covers everyone, but a person with no
  // site at all is never placed by guesswork.
  const sharesSite = (candidate, person) => { const own = personSites(person); if (!own.length) return false; const covers = personSites(candidate); return !covers.length || covers.some((site) => own.includes(site)); };
  const inferred = (person) => {
    if (SUPERVISOR_KEYS.includes(person.designationKey)) {
      return managers.find((manager) => DEPARTMENT_OF[manager.designationKey] === DEPARTMENT_OF[person.designationKey] && sharesSite(manager, person))
        || pms.find((pm) => sharesSite(pm, person)) || null;
    }
    if (MANAGER_KEYS.includes(person.designationKey)) return pms.find((pm) => sharesSite(pm, person)) || null;
    return null;
  };
  const links = new Map();
  people.forEach((person) => {
    if (person.designationKey === "director") return;
    const explicit = person.superiors.map(resolve).find((found) => found && found !== person) || null;
    const parent = explicit || inferred(person);
    links.set(person, { parent, explicit: Boolean(explicit), superiorText: person.superiors.join(", ") });
  });
  // Under a superior: Production, then Maintenance, then MIS; managers before supervisors; then by name.
  const departmentRank = (person) => { const department = DEPARTMENT_OF[person.designationKey]; return department ? DEPARTMENT_ORDER.indexOf(department) : person.designationKey === "projectManager" ? -1 : DEPARTMENT_ORDER.length; };
  const levelRank = (person) => MANAGER_KEYS.includes(person.designationKey) ? 0 : SUPERVISOR_KEYS.includes(person.designationKey) ? 1 : 2;
  const childrenOf = (parent) => people.filter((person) => links.get(person)?.parent === parent).sort((a, b) => departmentRank(a) - departmentRank(b) || levelRank(a) - levelRank(b) || byName(a, b));
  // A site box only shows the people of that site: a PM over two sites appears in
  // both boxes, each time with that site's staff under him.
  const belongsTo = (person, site) => { const sites = personSites(person); return !sites.length || sites.includes(site); };
  const node = (person, site, depth = 0, seen = new Set()) => {
    const link = links.get(person) || {};
    const children = depth < 8 && !seen.has(person) ? childrenOf(person).filter((child) => belongsTo(child, site)).map((child) => node(child, site, depth + 1, new Set([...seen, person]))) : [];
    return { person, explicit: Boolean(link.explicit), superiorText: link.superiorText || "", children };
  };
  const siteNames = [...new Set(people.filter((person) => person.designationKey !== "director").flatMap(personSites))].sort((a, b) => a.localeCompare(b));
  const placed = new Set();
  const collect = (tree) => { placed.add(tree.person); tree.children.forEach(collect); };
  const siteFor = (site) => {
    const sitePms = pms.filter((pm) => { const sites = personSites(pm); return sites.includes(site) || (!sites.length && site === ALL_SITES); });
    // People who report to no one reachable from a PM but belong to this site sit directly under the site.
    const roots = [...sitePms, ...people.filter((person) => person.designationKey !== "director" && !pms.includes(person) && !links.get(person)?.parent && personSites(person).includes(site))];
    const trees = [...new Set(roots)].map((person) => node(person, site));
    trees.forEach(collect);
    return { site, pms: sitePms, trees };
  };
  const sites = siteNames.map(siteFor);
  const withoutSite = pms.filter((pm) => !personSites(pm).length);
  if (withoutSite.length) sites.unshift(siteFor(ALL_SITES));
  directors.forEach((director) => placed.add(director));
  const unplaced = people.filter((person) => !placed.has(person) && !["superAdmin", "admin"].includes(person.designationKey)).sort(byName);
  const linkRows = (test) => people.filter((person) => { const link = links.get(person); return link && test(link); })
    .map((person) => ({ person, parent: links.get(person).parent, superiorText: links.get(person).superiorText })).sort((a, b) => byName(a.person, b.person));
  const explicitLinks = linkRows((link) => link.explicit);
  const inferredLinks = linkRows((link) => link.parent && !link.explicit);
  return { directors, sites, unplaced, explicitLinks, inferredLinks, inferredCount: inferredLinks.length, linkedCount: explicitLinks.length };
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
  const reporting = buildReportingLines(people);
  const sites = buildSiteViews({ people, rows, reporting, access });
  return {
    people,
    access,
    levels,
    peopleTree,
    reporting,
    sites,
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

// Directors and PMs without a site list count for every site; admins stay company-wide.
const GLOBAL_KEYS = ["director", "projectManager"];
const designationByLabel = (label) => CHART_DESIGNATIONS.find((designation) => words(designation.label) === words(label)) || null;
const sectionRank = (section) => { const index = CHART_SECTIONS.indexOf(section); return index < 0 ? CHART_SECTIONS.length : index; };

/** People who count for a site: they list it, or they have no site and hold a company-wide designation. */
export function peopleAtSite(people = [], site = "") {
  return people.filter((person) => {
    const sites = personSites(person);
    return sites.includes(site) || (!sites.length && GLOBAL_KEYS.includes(person.designationKey));
  });
}

/**
 * The same three pictures, one per site: access structure, hierarchy levels and
 * reporting lines. `companyWide` holds the roles that are not tied to a site.
 */
export function buildSiteViews({ people = [], rows = [], reporting = { sites: [] }, access = {} } = {}) {
  const siteNames = [...new Set(people.flatMap(personSites))].sort((a, b) => a.localeCompare(b));
  const companyWide = {
    superAdmins: access.superAdmins || [],
    admins: access.admins || [],
    directors: people.filter((person) => person.designationKey === "director"),
    managersWithoutSite: people.filter((person) => person.adminLevel === "Manager" && !personSites(person).length),
  };
  const sites = siteNames.map((site) => {
    const here = peopleAtSite(people, site);
    const managers = here.filter((person) => person.adminLevel === "Manager");
    const mobile = here.filter((person) => person.userType === "Mobile User");
    const applicable = rows.filter((row) => !row.siteAccess.length || row.siteAccess.some((ticked) => words(ticked) === words(site)));
    const levels = [...new Set(applicable.map((row) => row.section))].sort((a, b) => sectionRank(a) - sectionRank(b) || a.localeCompare(b))
      .map((section) => ({
        section,
        rows: applicable.filter((row) => row.section === section).sort((a, b) => a.level - b.level || a.designation.localeCompare(b.designation))
          .map((row) => { const designation = designationByLabel(row.designation); return { ...row, key: designation?.key || "", people: designation ? here.filter((person) => person.designationKey === designation.key) : [] }; }),
      }));
    return {
      site,
      people: here,
      access: {
        managerRoles: MANAGER_ROLE_ORDER.map((role) => ({ role, people: managers.filter((person) => person.managerRoles.includes(role)) })),
        mobileGroups: MOBILE_GROUP_ORDER.map((group) => ({ group, people: mobile.filter((person) => person.assignedRole === group) })),
        otherMobile: mobile.filter((person) => !MOBILE_GROUP_ORDER.includes(person.assignedRole)),
      },
      levels,
      reporting: (reporting.sites || []).find((entry) => entry.site === site) || { site, pms: [], trees: [] },
    };
  });
  return { companyWide, sites };
}

/** Short labels for the designation keys, shared by the pages and the detail lists. */
export const ROLE_LABELS = Object.freeze({
  director: "Director", projectManager: "Project Manager", productionManager: "Production Manager", maintenanceManager: "Maintenance Manager", misManager: "MIS Manager",
  productionSupervisor: "Production Incharge / Supervisor", maintenanceSupervisor: "Maintenance Incharge / Supervisor", misSupervisor: "MIS Incharge / Supervisor",
  oemNationalHead: "National Head", oemRegionalHead: "Regional / Zonal Head", oemAreaServiceEngineer: "Area Service Engineer", oemServiceEngineer: "Service Engineer", superAdmin: "Super Admin", admin: "Admin",
});

const PERSON_COLUMNS = [["name", "Name"], ["login", "Login"], ["type", "Account type"], ["access", "Access / User Group"], ["roles", "Manager roles"], ["designation", "Designation"], ["site", "Site"]];
const personRow = (person) => ({
  name: person.name, login: person.login || "—", type: person.userType || "No login type",
  access: person.adminLevel || person.assignedRole || "—", roles: person.managerRoles.join(", ") || "—",
  designation: ROLE_LABELS[person.designationKey] || "—", site: person.site || person.sites.join(", ") || person.region || "All",
});
const LINK_COLUMNS = [["name", "Person"], ["designation", "Designation"], ["reportsTo", "Reports to"], ["source", "Source"], ["site", "Site"]];
const linkRow = ({ person, parent, superiorText }, explicit) => ({
  name: person.name, designation: ROLE_LABELS[person.designationKey] || "—", reportsTo: parent ? parent.name : "—",
  source: explicit ? "Superior field" : superiorText ? `Superior "${superiorText}" not found · placed by designation and site` : "No Superior · placed by designation and site",
  site: person.site || person.sites.join(", ") || "All",
});

/**
 * The records behind a number on the organisation pages, as a small table.
 * `kind`: sites | people | superUsers | managers | mobileUsers | hierarchyRows | explicitLinks | inferredLinks.
 * With `site`, people-type lists and hierarchy rows are limited to that site.
 */
export function organisationDetail(chart, kind, site = "") {
  const entry = site ? (chart.sites?.sites || []).find((item) => item.site === site) : null;
  const people = entry ? entry.people : chart.people || [];
  const at = site ? ` at ${site}` : "";
  const list = (title, rows) => ({ kind, site, title, columns: PERSON_COLUMNS, rows: rows.map(personRow) });
  switch (kind) {
    case "sites":
      return { kind, site: "", title: "Sites", columns: [["site", "Site"], ["people", "People"], ["managers", "Managers"], ["mobile", "Mobile users"], ["pms", "Project Manager"]],
        rows: (chart.sites?.sites || []).map((item) => ({ site: item.site, people: item.people.length, managers: item.people.filter((person) => person.adminLevel === "Manager").length, mobile: item.people.filter((person) => person.userType === "Mobile User").length, pms: item.reporting.pms.map((person) => person.name).join(", ") || "—" })) };
    case "people": return list(`People${at}`, people);
    case "superUsers": return list(`Super Users${at}`, people.filter((person) => person.userType === "Super User"));
    case "managers": return list(`Managers${at}`, people.filter((person) => person.adminLevel === "Manager"));
    case "mobileUsers": return list(`Mobile Users${at}`, people.filter((person) => person.userType === "Mobile User"));
    case "hierarchyRows": {
      const sections = entry ? entry.levels : chart.levels || [];
      return { kind, site, title: `Hierarchy master rows${at}`, columns: [["section", "Section"], ["designation", "Designation"], ["level", "Level"], ["schedule", "Schedule"], ["sites", "Site ticks"]],
        rows: sections.flatMap((section) => section.rows.map((row) => ({ section: section.section, designation: row.designation, level: row.level ? `L${row.level}` : "—", schedule: row.schedule || "—", sites: row.siteAccess.length ? row.siteAccess.join(", ") : "All sites" }))) };
    }
    case "explicitLinks":
    case "inferredLinks": {
      const explicit = kind === "explicitLinks";
      const links = (explicit ? chart.reporting?.explicitLinks : chart.reporting?.inferredLinks) || [];
      const rows = site ? links.filter((link) => personSites(link.person).includes(site)) : links;
      return { kind, site, title: explicit ? `Reporting links from the Superior field${at}` : `Placed by designation and site${at}`, columns: LINK_COLUMNS, rows: rows.map((link) => linkRow(link, explicit)) };
    }
    default:
      return { kind, site, title: "Details", columns: [], rows: [] };
  }
}
