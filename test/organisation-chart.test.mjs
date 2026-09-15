import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOrganisationChart, buildReportingLines, chartDesignationKey, chartPerson, peopleAtSite, personSites, CHART_DESIGNATIONS, ORGANISATION_PAGES, ORGANISATION_PAGE_NAMES } from "../src/organisation-chart.mjs";
import { flowDesignationForUser } from "../hierarchy-report-flow.mjs";
import { resolveMobileAccess } from "../mobile-access.mjs";
import { masterAccessAllows } from "../admin-access.mjs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const view = readFileSync(new URL("../src/organisation-chart.jsx", import.meta.url), "utf8");

const users = [
  { login: "mohit", employee: "Mohit Chadda", userType: "Super User", adminLevel: "Super Admin", designation: "Director" },
  { login: "vivek", employee: "Vivek", userType: "Super User", adminLevel: "Manager", managerRole: "Project Manager", managerRegion: "Chandrapur", managerSites: "Sasti OB|Majri OB" },
  { login: "priyank", employee: "Priyank Rao", userType: "Super User", adminLevel: "Manager", managerRole: "Production Manager", managerSites: "Sasti OB" },
  { login: "rajesh", employee: "Rajesh More", userType: "Super User", adminLevel: "Manager", managerRole: "Maintenance Manager|MIS Manager" },
  { login: "anoop", employee: "Anoop Paul", userType: "Super User", adminLevel: "Admin" },
  { login: "ramesh", employee: "Ramesh Kumar", userType: "Mobile User", userGroup: "Production User", site: "Sasti OB" },
  { login: "suresh", employee: "Suresh Patil", userType: "Mobile User", site: "Sasti OB" },
  { login: "priya", employee: "Priya Deshmukh", userType: "Mobile User", userGroup: "MIS User", site: "Sasti OB" },
  { login: "kiran", employee: "Kiran Shah", userType: "", designation: "Production Incharge" },
  { login: "oem1", employee: "Arun Mehta", userType: "Super User", adminLevel: "Admin", designation: "Area Service Engineer" },
];
const privileges = [{ username: "suresh", userGroup: "Maintenance User", accessType: "Mobile User" }];
const hierarchy = [
  { section: "Management", designation: "Director's", level: "1", schedule: "Daily 07:00:00 PM" },
  { section: "Management", designation: "Project Manager (P.M)", level: "2", schedule: "08:00 AM & 06:00 PM" },
  { section: "Production Dept.", designation: "Production Manager", level: "L3", schedule: "Every event", siteAccess: "Sasti OB|Majri OB" },
  { section: "Production Dept.", designation: "Production Incharge / Supervisor", level: "4" },
  { section: "OEM", designation: "Area Service engineer", level: "3" },
];

test("the people tree names the holders of each designation, e.g. Director's (Mohit Chadda) and Project Manager (Vivek)", () => {
  const chart = buildOrganisationChart({ users, privileges, hierarchy });
  const byKey = Object.fromEntries(chart.peopleTree.flatMap((section) => section.designations).map((designation) => [designation.key, designation]));
  assert.deepEqual(byKey.director.people.map((person) => person.name), ["Mohit Chadda"]);
  assert.deepEqual(byKey.projectManager.people.map((person) => person.name), ["Vivek"]);
  assert.deepEqual(byKey.productionManager.people.map((person) => person.name), ["Priyank Rao"]);
  assert.deepEqual(byKey.maintenanceManager.people.map((person) => person.name), ["Rajesh More"], "the first manager role decides the designation");
  assert.deepEqual(byKey.productionSupervisor.people.map((person) => person.name), ["Kiran Shah", "Ramesh Kumar"], "Production Users sit under the production supervisor level");
  assert.deepEqual(byKey.maintenanceSupervisor.people.map((person) => person.name), ["Suresh Patil"], "the User Group can come from the Privilege row");
  assert.deepEqual(byKey.misSupervisor.people.map((person) => person.name), ["Priya Deshmukh"]);
  assert.deepEqual(byKey.oemAreaServiceEngineer.people.map((person) => person.name), ["Arun Mehta"]);
  assert.deepEqual(byKey.admin.people.map((person) => person.name), ["Anoop Paul"]);
  assert.equal(byKey.director.configured.schedule, "Daily 07:00:00 PM", "the Hierarchy master row is attached to its designation");
  assert.equal(byKey.productionManager.configured.level, 3, "levels written as L3 are understood");
  assert.equal(byKey.misManager.configured, null);
  assert.deepEqual(chart.unassigned, []);
  assert.equal(chart.summary.people, 10);
  assert.equal(chart.summary.designationsFilled, 9);
});

test("the access tree groups people by account type, access level, manager role and mobile User Group", () => {
  const chart = buildOrganisationChart({ users, privileges, hierarchy });
  assert.deepEqual(chart.access.superAdmins.map((person) => person.name), ["Mohit Chadda"]);
  assert.deepEqual(chart.access.admins.map((person) => person.name), ["Anoop Paul", "Arun Mehta"]);
  assert.deepEqual(chart.access.managerRoles.map(({ role, people }) => [role, people.map((person) => person.name)]), [
    ["Project Manager", ["Vivek"]], ["Production Manager", ["Priyank Rao"]], ["Maintenance Manager", ["Rajesh More"]], ["MIS Manager", ["Rajesh More"]],
  ]);
  assert.deepEqual(chart.access.mobileGroups.map(({ group, people }) => [group, people.map((person) => person.name)]), [
    ["Production User", ["Ramesh Kumar"]], ["Maintenance User", ["Suresh Patil"]], ["MIS User", ["Priya Deshmukh"]],
  ]);
  assert.deepEqual(chart.access.noAccess.map((person) => person.name), ["Kiran Shah"]);
  const vivek = chart.people.find((person) => person.login === "vivek");
  assert.deepEqual([vivek.region, vivek.sites], ["Chandrapur", ["Sasti OB", "Majri OB"]]);
  assert.equal(chart.summary.managers, 3);
});

test("hierarchy levels follow the Hierarchy master rows in section and level order", () => {
  const chart = buildOrganisationChart({ users: [], privileges: [], hierarchy: [...hierarchy].reverse() });
  assert.deepEqual(chart.levels.map((section) => [section.section, section.rows.map((row) => `L${row.level} ${row.designation}`)]), [
    ["Management", ["L1 Director's", "L2 Project Manager (P.M)"]],
    ["Production Dept.", ["L3 Production Manager", "L4 Production Incharge / Supervisor"]],
    ["OEM", ["L3 Area Service engineer"]],
  ]);
  assert.deepEqual(chart.levels[1].rows[0].siteAccess, ["Sasti OB", "Majri OB"]);
  assert.deepEqual(buildOrganisationChart({}).levels, []);
});

test("the chart resolves designations like the WhatsApp report flow, except that an explicit job title beats the Super Admin level", () => {
  const samples = [...users.filter((user) => user.login !== "mohit"), { employee: "Zonal Head Person", designation: "Zonal Head" }, { employee: "Plain", userType: "Mobile User" }, { employee: "Head Office", designation: "National Head" }, { employee: "MIS Incharge", userType: "Super User", adminLevel: "Admin", department: "MIS incharge" }, { employee: "Boss", userType: "Super User", adminLevel: "Super Admin" }, { employee: "Any Manager", userType: "Super User", adminLevel: "Manager" }];
  for (const user of samples) {
    const profile = resolveMobileAccess({ user });
    assert.equal(chartDesignationKey(user, profile), flowDesignationForUser(user, profile)?.key || "", JSON.stringify(user));
  }
  const mohit = users.find((user) => user.login === "mohit");
  assert.equal(flowDesignationForUser(mohit, resolveMobileAccess({ user: mohit }))?.key, "superAdmin", "reports treat the Super Admin level as its own authority");
  assert.equal(chartDesignationKey(mohit), "director", "the chart shows the person under the title they hold");
  assert.equal(CHART_DESIGNATIONS.length, 14);
  assert.equal(chartPerson({ login: "x" }).name, "x");
  assert.equal(chartPerson({}).name, "Unnamed");
});

test("three read-only pages sit in the Masters menu for Admin and Super Admin only", () => {
  assert.deepEqual(ORGANISATION_PAGE_NAMES, ["Access structure", "Hierarchy levels", "Reporting structure"]);
  assert.equal(ORGANISATION_PAGES.reporting, "Reporting structure");
  assert.match(main, /\["Hierarchy master", Network\],\n  \["Access structure", Users\],\n  \["Hierarchy levels", Network\],\n  \["Reporting structure", Building2\],/);
  assert.match(main, /if\(ORGANISATION_PAGE_NAMES\.includes\(name\)\)return isAdministrator;/);
  assert.match(main, /ORGANISATION_PAGE_NAMES\.includes\(active\) \? \(\n\s+<OrganisationChartPage view=\{Object\.keys\(ORGANISATION_PAGES\)\.find\(\(key\) => ORGANISATION_PAGES\[key\] === active\)\} \/>/);
  assert.match(main, /useMasterRecords\("Users & employees"\);\n\s+const \[privileges, , privilegesLoaded, , , , privilegesError, refreshPrivileges\] = useMasterRecords\("Privilege"\);\n\s+const \[hierarchy, , hierarchyLoaded, , , , hierarchyError, refreshHierarchy\] = useMasterRecords\("Hierarchy master"\);/, "all three masters feed the pages and revalidate on their own");
  for (const name of ORGANISATION_PAGE_NAMES) {
    assert.equal(masterAccessAllows({ adminLevel: "Super Admin", masterAccess: ["Equipment master"] }, name), true, `${name}: not switchable off in Privilege`);
    assert.equal(masterAccessAllows({ adminLevel: "Admin" }, name), true);
    assert.equal(masterAccessAllows({ adminLevel: "Manager" }, name), false);
  }
  assert.doesNotMatch(view, /onAdd|onEdit|onDelete|<input|<textarea|<select/, "the views have no editing controls");
  assert.match(view, /role="tablist" aria-label="Sites"/, "every page has an All sites / per-site switch");
});

test("reporting lines put the directors on top and build each site from PM to managers to supervisors using the Superior field", () => {
  const staff = [
    { login: "mohit", employee: "Mohit Chadda", userType: "Super User", adminLevel: "Super Admin", designation: "Director" },
    { login: "manish", employee: "Manish Chadda", userType: "Super User", adminLevel: "Super Admin", designation: "Director" },
    { login: "rahul", employee: "Rahul Chadda", userType: "Super User", adminLevel: "Super Admin", designation: "Director" },
    { login: "vivek", employee: "Vivek", userType: "Super User", adminLevel: "Manager", managerRole: "Project Manager", managerSites: "Sasti OB", superior: "Mohit Chadda|Manish Chadda|Rahul Chadda" },
    { login: "ajay", employee: "Ajay Singh", userType: "Super User", adminLevel: "Manager", managerRole: "Project Manager", managerSites: "Majri OB", superior: "Mohit Chadda" },
    { login: "priyank", employee: "Priyank Rao", userType: "Super User", adminLevel: "Manager", managerRole: "Production Manager", managerSites: "Sasti OB", superior: "Vivek" },
    { login: "rajesh", employee: "Rajesh More", userType: "Super User", adminLevel: "Manager", managerRole: "Maintenance Manager", managerSites: "Sasti OB", superior: "vivek" },
    { login: "neha", employee: "Neha Kulkarni", userType: "Super User", adminLevel: "Manager", managerRole: "MIS Manager", managerSites: "Sasti OB" },
    { login: "ramesh", employee: "Ramesh Kumar", userType: "Mobile User", userGroup: "Production User", site: "Sasti OB", superior: "Priyank Rao" },
    { login: "suresh", employee: "Suresh Patil", userType: "Mobile User", userGroup: "Maintenance User", site: "Sasti OB" },
    { login: "priya", employee: "Priya Deshmukh", userType: "Mobile User", userGroup: "MIS User", site: "Sasti OB", superior: "Somebody Unknown" },
    { login: "dinesh", employee: "Dinesh Pawar", userType: "Mobile User", userGroup: "Production User", site: "Majri OB", superior: "Ajay Singh" },
    { login: "lost", employee: "Lost Person", userType: "Mobile User", userGroup: "Production User" },
    { login: "anoop", employee: "Anoop Paul", userType: "Super User", adminLevel: "Admin" },
  ];
  const chart = buildOrganisationChart({ users: staff });
  const { reporting } = chart;
  assert.deepEqual(reporting.directors.map((person) => person.name), ["Manish Chadda", "Mohit Chadda", "Rahul Chadda"]);
  assert.deepEqual(reporting.sites.map((site) => site.site), ["Majri OB", "Sasti OB"]);
  const sasti = reporting.sites.find((site) => site.site === "Sasti OB");
  assert.deepEqual(sasti.pms.map((person) => person.name), ["Vivek"]);
  const outline = (tree, depth = 0) => [`${"  ".repeat(depth)}${tree.person.name}${tree.explicit ? "" : " *"}`, ...tree.children.flatMap((child) => outline(child, depth + 1))];
  assert.deepEqual(sasti.trees.flatMap((tree) => outline(tree)), [
    "Vivek",
    "  Priyank Rao",
    "    Ramesh Kumar",
    "  Rajesh More",
    "    Suresh Patil *",
    "  Neha Kulkarni *",
    "    Priya Deshmukh *",
  ], "Production, then Maintenance, then MIS; explicit superiors are used; missing or unknown ones fall back to the department manager of the site and are flagged");
  const majri = reporting.sites.find((site) => site.site === "Majri OB");
  assert.deepEqual(majri.trees.flatMap((tree) => outline(tree)), ["Ajay Singh", "  Dinesh Pawar"]);
  assert.deepEqual(reporting.unplaced.map((person) => person.name), ["Lost Person"], "people without a site or a superior are listed, not lost; admins are not reporting-line staff");
  assert.equal(reporting.linkedCount, 6);
  assert.equal(reporting.inferredCount, 3);
  assert.deepEqual(personSites({ sites: ["A", "B"], site: "C" }), ["A", "B"]);
  assert.deepEqual(personSites({ site: "C" }), ["C"]);
  const alone = buildReportingLines([]);
  assert.deepEqual([alone.directors, alone.sites, alone.unplaced], [[], [], []]);
});

test("the reporting page renders directors, per-site trees and flags inferred placements", () => {
  assert.match(view, /reporting: \{ title: ORGANISATION_PAGES\.reporting/);
  assert.match(view, /function ReportingNode\(\{ tree \}\)/);
  assert.match(view, /placed by designation and site/);
  assert.match(view, /reporting\.directors\.map\(\(director\) =>/);
  assert.match(view, /visible\.map\(\(entry\) => <SiteBlock key=\{entry\.site\} entry=\{entry\} \/>\)/);
  assert.match(view, /const SiteBlock = view === "access" \? AccessSite : view === "levels" \? LevelsSite : ReportingSite;/);
  assert.match(view, /Not placed on any site/);
  assert.match(view, /Company-wide/);
});

test("every page is site-wise: access, levels and reporting are built per site with company-wide roles on top", () => {
  const staff = [
    { login: "mohit", employee: "Mohit Chadda", userType: "Super User", adminLevel: "Super Admin", designation: "Director" },
    { login: "vivek", employee: "Vivek", userType: "Super User", adminLevel: "Manager", managerRole: "Project Manager", managerSites: "Sasti OB|Majri OB" },
    { login: "priyank", employee: "Priyank Rao", userType: "Super User", adminLevel: "Manager", managerRole: "Production Manager", managerSites: "Sasti OB", superior: "Vivek" },
    { login: "kamal", employee: "Kamal Verma", userType: "Super User", adminLevel: "Manager", managerRole: "Maintenance Manager", managerSites: "Majri OB", superior: "Vivek" },
    { login: "ramesh", employee: "Ramesh Kumar", userType: "Mobile User", userGroup: "Production User", site: "Sasti OB", superior: "Priyank Rao" },
    { login: "anil", employee: "Anil Wagh", userType: "Mobile User", userGroup: "Maintenance User", site: "Majri OB" },
    { login: "anoop", employee: "Anoop Paul", userType: "Super User", adminLevel: "Admin" },
    { login: "float", employee: "Floating Manager", userType: "Super User", adminLevel: "Manager", managerRole: "MIS Manager" },
  ];
  const hierarchy = [
    { section: "Management", designation: "Project Manager (P.M)", level: "2" },
    { section: "Production Dept.", designation: "Production Manager", level: "3", siteAccess: "Sasti OB" },
    { section: "Maintenance Dept.", designation: "Maintenance Manager", level: "3", siteAccess: "Majri OB" },
    { section: "MIS Dept.", designation: "MIS Manager", level: "3" },
  ];
  const chart = buildOrganisationChart({ users: staff, hierarchy });
  const { companyWide, sites } = chart.sites;
  assert.deepEqual(sites.map((entry) => entry.site), ["Majri OB", "Sasti OB"]);
  assert.deepEqual(companyWide.superAdmins.map((person) => person.name), ["Mohit Chadda"]);
  assert.deepEqual(companyWide.admins.map((person) => person.name), ["Anoop Paul"]);
  assert.deepEqual(companyWide.directors.map((person) => person.name), ["Mohit Chadda"]);
  assert.deepEqual(companyWide.managersWithoutSite.map((person) => person.name), ["Floating Manager"]);
  const sasti = sites.find((entry) => entry.site === "Sasti OB");
  assert.deepEqual(sasti.access.managerRoles.map(({ role, people }) => [role, people.map((person) => person.name)]), [
    ["Project Manager", ["Vivek"]], ["Production Manager", ["Priyank Rao"]], ["Maintenance Manager", []], ["MIS Manager", []],
  ], "a PM over two sites appears at both; a manager of another site does not");
  assert.deepEqual(sasti.access.mobileGroups.map(({ group, people }) => [group, people.map((person) => person.name)]), [
    ["Production User", ["Ramesh Kumar"]], ["Maintenance User", []], ["MIS User", []],
  ]);
  assert.deepEqual(sasti.levels.map((section) => [section.section, section.rows.map((row) => `${row.designation}:${row.people.map((person) => person.name).join("+")}`)]), [
    ["Management", ["Project Manager (P.M):Vivek"]],
    ["Production Dept.", ["Production Manager:Priyank Rao"]],
    ["MIS Dept.", ["MIS Manager:"]],
  ], "rows ticked for another site are left out; rows without site ticks apply everywhere");
  const majri = sites.find((entry) => entry.site === "Majri OB");
  assert.deepEqual(majri.levels.map((section) => section.section), ["Management", "Maintenance Dept.", "MIS Dept."]);
  assert.deepEqual(majri.reporting.trees.map((tree) => [tree.person.name, tree.children.map((child) => [child.person.name, child.children.map((grand) => grand.person.name)])]), [["Vivek", [["Kamal Verma", ["Anil Wagh"]]]]]);
  assert.deepEqual(peopleAtSite(chart.people, "Sasti OB").map((person) => person.name), ["Mohit Chadda", "Priyank Rao", "Ramesh Kumar", "Vivek"], "company-wide designations without a site count for every site; admins do not");
  assert.deepEqual(buildOrganisationChart({}).sites, { companyWide: { superAdmins: [], admins: [], directors: [], managersWithoutSite: [] }, sites: [] });
});
