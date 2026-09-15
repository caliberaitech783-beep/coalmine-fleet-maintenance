import React, { useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { ORGANISATION_PAGES } from "./organisation-chart.mjs";
import "./organisation-chart.css";

const Person = ({ person }) => <span className="org-person"><b>{person.name}</b><small>{[person.login, person.site || person.region || person.sites.join(", ")].filter(Boolean).join(" · ")}</small></span>;
const People = ({ people, empty = "No one assigned" }) => people.length
  ? <ul className="org-people">{people.map((person) => <li key={`${person.login}|${person.name}`}><Person person={person} /></li>)}</ul>
  : <span className="org-empty">{empty}</span>;
const Node = ({ tag, tagClass = "", title, subtitle, children }) => <span className="org-node">{tag && <i className={`org-tag ${tagClass}`}>{tag}</i>}<b>{title}</b>{subtitle && <small>{subtitle}</small>}{children}</span>;
const countLabel = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const ROLE_LABEL = {
  director: "Director", projectManager: "Project Manager", productionManager: "Production Manager", maintenanceManager: "Maintenance Manager", misManager: "MIS Manager",
  productionSupervisor: "Production Incharge / Supervisor", maintenanceSupervisor: "Maintenance Incharge / Supervisor", misSupervisor: "MIS Incharge / Supervisor",
  oemNationalHead: "National Head", oemRegionalHead: "Regional / Zonal Head", oemAreaServiceEngineer: "Area Service Engineer", oemServiceEngineer: "Service Engineer", superAdmin: "Super Admin", admin: "Admin",
};
const roleClass = (key) => key === "projectManager" ? "t-level" : /Manager$/.test(key) ? "t-mgr" : /Supervisor$/.test(key) ? "t-mobile" : key?.startsWith("oem") ? "t-oem" : "t-none";
const PAGE_TEXT = {
  access: { title: ORGANISATION_PAGES.access, intro: "Who can sign in at each site and with what access: managers by role and mobile users by User Group. Company-wide roles sit on top." },
  levels: { title: ORGANISATION_PAGES.levels, intro: "The Hierarchy master escalation levels that apply to each site, with the people at that site who hold each designation." },
  reporting: { title: ORGANISATION_PAGES.reporting, intro: "Who reports to whom, from the Superior field in Users & employees: Directors on top, then each site's Project Manager, the department managers (Production, Maintenance, MIS) and the incharges and supervisors under each manager. Faded entries have no matching Superior and are placed by designation and site." },
};

function ReportingNode({ tree }) {
  const { person, explicit, superiorText, children } = tree;
  const note = explicit ? "" : superiorText ? `Superior "${superiorText}" not found · placed by designation and site` : "no Superior set · placed by designation and site";
  return <li className={explicit ? "" : "org-inferred"}>
    <Node tag={ROLE_LABEL[person.designationKey] || "Staff"} tagClass={roleClass(person.designationKey)} title={person.name} subtitle={[person.login, person.site || person.sites.join(", ")].filter(Boolean).join(" · ")} />
    {note && <small className="org-note" title={note}>{note}</small>}
    {children.length > 0 && <ul>{children.map((child) => <ReportingNode key={`${child.person.login}|${child.person.name}`} tree={child} />)}</ul>}
  </li>;
}

function SiteHeading({ site, detail }) {
  return <h3><span className="org-tag t-type">SITE</span>{site}{detail && <small>{detail}</small>}</h3>;
}

function AccessSite({ entry }) {
  const { site, access, people } = entry;
  return <section className="org-site">
    <SiteHeading site={site} detail={countLabel(people.length, "person", "people")} />
    <div className="org-tree"><ul>
      <li className="org-root"><Node title="Managers" subtitle="Super User · access level Manager" />
        <ul>{access.managerRoles.map(({ role, people: holders }) => <li key={role}><Node tag="ROLE" tagClass="t-mgr" title={role} /><People people={holders} /></li>)}</ul></li>
      <li className="org-root"><Node title="Mobile users" subtitle="User Group from Privilege" />
        <ul>{access.mobileGroups.map(({ group, people: holders }) => <li key={group}><Node tag="GROUP" tagClass="t-mobile" title={group} /><People people={holders} /></li>)}
          {access.otherMobile.length > 0 && <li><Node tag="GROUP" tagClass="t-mobile" title="Other / no User Group" /><People people={access.otherMobile} /></li>}</ul></li>
    </ul></div>
  </section>;
}

function LevelsSite({ entry }) {
  const { site, levels } = entry;
  return <section className="org-site">
    <SiteHeading site={site} detail={countLabel(levels.reduce((sum, section) => sum + section.rows.length, 0), "designation", "designations")} />
    {levels.length ? <div className="org-tree"><ul>{levels.map(({ section, rows }) => <li key={section} className="org-root"><Node title={section} subtitle={countLabel(rows.length, "designation", "designations")} />
      <ul>{rows.map((row) => <li key={`${section}|${row.designation}`}><Node tag={row.level ? `L${row.level}` : "L?"} tagClass={section === "OEM" ? "t-oem" : "t-level"} title={row.people.length ? `${row.designation} (${row.people.map((person) => person.name).join(", ")})` : row.designation} subtitle={row.schedule || undefined} /><People people={row.people} empty="Nobody at this site holds this designation" /></li>)}</ul></li>)}</ul></div>
      : <p className="org-empty">No Hierarchy master row applies to this site.</p>}
  </section>;
}

function ReportingSite({ entry }) {
  const { site, reporting } = entry;
  return <section className="org-site">
    <SiteHeading site={site} detail={reporting.pms.length ? countLabel(reporting.pms.length, "Project Manager", "Project Managers") : "no Project Manager"} />
    {reporting.trees.length ? <div className="org-tree"><ul>{reporting.trees.map((tree) => <ReportingNode key={`${tree.person.login}|${tree.person.name}`} tree={tree} />)}</ul></div> : <p className="org-empty">Nobody is placed at this site yet.</p>}
  </section>;
}

/** Read-only, site-wise organisation pages: access structure, hierarchy levels, reporting structure. */
export default function OrganisationChartView({ view = "reporting", chart, loading = false, error = "", updatedAt = 0, onRefresh }) {
  const [activeSite, setActiveSite] = useState("all");
  const { sites, companyWide } = chart.sites;
  const { reporting, summary } = chart;
  const text = PAGE_TEXT[view] || PAGE_TEXT.reporting;
  const visible = activeSite === "all" ? sites : sites.filter((entry) => entry.site === activeSite);
  const updated = updatedAt ? new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  const SiteBlock = view === "access" ? AccessSite : view === "levels" ? LevelsSite : ReportingSite;
  return <section className={`panel pagepanel organisation-chart org-view-${view}`} aria-busy={loading}>
    <header><div><span className="page-eyebrow">Masters · read only · site-wise</span><h1>{text.title}</h1><p>{text.intro} Updates by itself whenever Users &amp; employees, Privilege or Hierarchy master change.</p></div>
      <div className="org-chart-actions">{updated && <span className="org-updated">Updated {updated}</span>}<button type="button" className="secondary" onClick={onRefresh} disabled={loading}><RefreshCw /> {loading ? "Refreshing…" : "Refresh"}</button></div></header>
    {error && <div className="org-error" role="alert"><AlertTriangle /><span>{error}</span></div>}
    <div className="org-summary" aria-label="Summary">
      <article><small>Sites</small><b>{sites.length}</b></article>
      <article><small>People</small><b>{summary.people}</b></article>
      <article><small>Super Users</small><b>{summary.superUsers}</b></article>
      <article><small>Managers</small><b>{summary.managers}</b></article>
      <article><small>Mobile Users</small><b>{summary.mobileUsers}</b></article>
      <article><small>Hierarchy rows</small><b>{summary.hierarchyRows}</b></article>
    </div>
    <div className="org-site-chips" role="tablist" aria-label="Sites">
      <button type="button" role="tab" aria-selected={activeSite === "all"} className={activeSite === "all" ? "active" : ""} onClick={() => setActiveSite("all")}>All sites</button>
      {sites.map((entry) => <button key={entry.site} type="button" role="tab" aria-selected={activeSite === entry.site} className={activeSite === entry.site ? "active" : ""} onClick={() => setActiveSite(entry.site)}>{entry.site}<small>{entry.people.length}</small></button>)}
    </div>
    {view === "access" && <div className="org-company"><span className="org-company-label">Company-wide</span>
      <div className="org-company-groups">
        <div><b>Super Admin</b><People people={companyWide.superAdmins} /></div>
        <div><b>Admin</b><People people={companyWide.admins} /></div>
        <div><b>Directors</b><People people={companyWide.directors} empty="No director found" /></div>
        {companyWide.managersWithoutSite.length > 0 && <div><b>Managers without a site</b><People people={companyWide.managersWithoutSite} /></div>}
      </div></div>}
    {view === "reporting" && <div className="org-directors">
      <span className="org-directors-label">Directors</span>
      {reporting.directors.length ? reporting.directors.map((director) => <span key={`${director.login}|${director.name}`} className="org-director"><b>{director.name}</b><small>{director.login || "Director"}</small></span>) : <span className="org-empty">No director found. Give the director records the designation "Director".</span>}
    </div>}
    <div className="org-sites">
      {visible.length ? visible.map((entry) => <SiteBlock key={entry.site} entry={entry} />) : <p className="org-empty">No sites yet. Fill Location or manager sites in Users &amp; employees.</p>}
    </div>
    {view === "reporting" && reporting.unplaced.length > 0 && <div className="org-unplaced"><b>Not placed on any site ({reporting.unplaced.length})</b><small>Fill Location and Superior in Users &amp; employees to place them.</small><People people={reporting.unplaced} /></div>}
    {view === "reporting" && <p className="org-hint">{reporting.linkedCount} reporting link{reporting.linkedCount === 1 ? "" : "s"} come from the Superior field{reporting.inferredCount ? `; ${reporting.inferredCount} placed by designation and site` : ""}.</p>}
  </section>;
}
