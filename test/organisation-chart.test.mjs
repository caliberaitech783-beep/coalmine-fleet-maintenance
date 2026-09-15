import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOrganisationChart, chartDesignationKey, chartPerson, CHART_DESIGNATIONS, ORGANISATION_CHART_PAGE } from "../src/organisation-chart.mjs";
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

test("the page sits in the Masters menu for Admin and Super Admin only and is read only", () => {
  assert.equal(ORGANISATION_CHART_PAGE, "Organisation chart");
  assert.match(main, /\["Hierarchy master", Network\],\n  \["Organisation chart", Users\],/);
  assert.match(main, /if\(name===ORGANISATION_CHART_PAGE\)return isAdministrator;/);
  assert.match(main, /active === ORGANISATION_CHART_PAGE \? \(\n\s+<OrganisationChartPage \/>/);
  assert.match(main, /useMasterRecords\("Users & employees"\);\n\s+const \[privileges, , privilegesLoaded, , , , privilegesError, refreshPrivileges\] = useMasterRecords\("Privilege"\);\n\s+const \[hierarchy, , hierarchyLoaded, , , , hierarchyError, refreshHierarchy\] = useMasterRecords\("Hierarchy master"\);/, "all three masters feed the chart and revalidate on their own");
  assert.equal(masterAccessAllows({ adminLevel: "Super Admin", masterAccess: ["Equipment master"] }, "Organisation chart"), true, "not switchable off in Privilege");
  assert.equal(masterAccessAllows({ adminLevel: "Admin" }, "Organisation chart"), true);
  assert.equal(masterAccessAllows({ adminLevel: "Manager" }, "Organisation chart"), false);
  assert.doesNotMatch(view, /onAdd|onEdit|onDelete|<input|<textarea|<select/, "the view has no editing controls");
  assert.match(view, /Director's \(Mohit Chadda\) and Project Manager \(Vivek\)/);
});
