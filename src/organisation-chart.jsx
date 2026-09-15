import React from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import "./organisation-chart.css";

const Person = ({ person, detail }) => <span className="org-person"><b>{person.name}</b>{detail !== false && <small>{[person.login, person.site || person.region || person.sites.join(", ")].filter(Boolean).join(" · ")}</small>}</span>;
const People = ({ people, empty = "No one assigned" }) => people.length
  ? <ul className="org-people">{people.map((person) => <li key={`${person.login}|${person.name}`}><Person person={person} /></li>)}</ul>
  : <span className="org-empty">{empty}</span>;
const countLabel = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const Node = ({ tag, tagClass = "", title, subtitle, children }) => <span className="org-node">{tag && <i className={`org-tag ${tagClass}`}>{tag}</i>}<b>{title}</b>{subtitle && <small>{subtitle}</small>}{children}</span>;

/** Read-only organisation chart: three trees built from the masters. */
export default function OrganisationChartView({ chart, loading = false, error = "", updatedAt = 0, onRefresh }) {
  const { access, levels, peopleTree, unassigned, summary } = chart;
  const updated = updatedAt ? new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  return <section className="panel pagepanel organisation-chart" aria-busy={loading}>
    <header><div><span className="page-eyebrow">Masters · read only</span><h1>Organisation chart</h1><p>Who is who, drawn from Users &amp; employees, Privilege and Hierarchy master. It refreshes itself whenever those masters change.</p></div>
      <div className="org-chart-actions">{updated && <span className="org-updated">Updated {updated}</span>}<button type="button" className="secondary" onClick={onRefresh} disabled={loading}><RefreshCw /> {loading ? "Refreshing…" : "Refresh"}</button></div></header>
    {error && <div className="org-error" role="alert"><AlertTriangle /><span>{error}</span></div>}
    <div className="org-summary" aria-label="Summary">
      <article><small>People</small><b>{summary.people}</b></article>
      <article><small>Super Users</small><b>{summary.superUsers}</b></article>
      <article><small>Managers</small><b>{summary.managers}</b></article>
      <article><small>Mobile Users</small><b>{summary.mobileUsers}</b></article>
      <article><small>Designations filled</small><b>{summary.designationsFilled}</b></article>
      <article><small>Hierarchy rows</small><b>{summary.hierarchyRows}</b></article>
    </div>
    <div className="org-grid">
      <article className="org-panel"><h2>1 · Access structure</h2><p className="org-hint">Account type, access level and roles, with the people in each.</p>
        <div className="org-tree"><ul><li className="org-root"><Node title="Users &amp; employees" subtitle={countLabel(summary.people, "person", "people")} />
          <ul>
            <li><Node tag="SUPER USER" tagClass="t-type" title="Web administration workspace" subtitle="all sites, or region + sites for Managers" />
              <ul>
                <li><Node tag="LEVEL" tagClass="t-admin" title="Super Admin" subtitle="full control" /><People people={access.superAdmins} /></li>
                <li><Node tag="LEVEL" tagClass="t-admin" title="Admin" subtitle="administration per privilege" /><People people={access.admins} /></li>
                <li><Node tag="LEVEL" tagClass="t-admin" title="Manager" subtitle="assigned region + sites" />
                  <ul>{access.managerRoles.map(({ role, people }) => <li key={role}><Node tag="ROLE" tagClass="t-mgr" title={role} /><People people={people} /></li>)}
                    {access.managersWithoutRole.length > 0 && <li><Node tag="ROLE" tagClass="t-mgr" title="No manager role set" /><People people={access.managersWithoutRole} /></li>}</ul></li>
              </ul></li>
            <li><Node tag="MOBILE USER" tagClass="t-type" title="Role workspace" subtitle="one assigned site · User Group from Privilege" />
              <ul>{access.mobileGroups.map(({ group, people }) => <li key={group}><Node tag="GROUP" tagClass="t-mobile" title={group} /><People people={people} /></li>)}
                {access.otherMobile.length > 0 && <li><Node tag="GROUP" tagClass="t-mobile" title="Other / no User Group" /><People people={access.otherMobile} /></li>}</ul></li>
            {access.noAccess.length > 0 && <li><Node tag="NO LOGIN TYPE" tagClass="t-none" title="No application user type" subtitle="record exists, cannot sign in" /><People people={access.noAccess} /></li>}
          </ul></li></ul></div>
      </article>
      <article className="org-panel"><h2>2 · Hierarchy levels</h2><p className="org-hint">Escalation levels exactly as configured in Hierarchy master.</p>
        {levels.length ? <div className="org-tree"><ul>{levels.map(({ section, rows }) => <li key={section} className="org-root"><Node title={section} subtitle={countLabel(rows.length, "designation", "designations")} />
          <ul>{rows.map((row) => <li key={`${section}|${row.designation}`}><Node tag={row.level ? `L${row.level}` : "L?"} tagClass="t-level" title={row.designation} subtitle={row.schedule || undefined} />{row.siteAccess.length > 0 && <small className="org-sites">Sites: {row.siteAccess.join(", ")}</small>}</li>)}</ul></li>)}</ul></div>
          : <p className="org-empty">Hierarchy master has no rows yet.</p>}
      </article>
      <article className="org-panel org-panel-wide"><h2>3 · People by designation</h2><p className="org-hint">Each designation with the named people who hold it, for example Director's (Mohit Chadda) and Project Manager (Vivek).</p>
        <div className="org-tree"><ul>{peopleTree.map(({ section, designations }) => <li key={section} className="org-root"><Node title={section} subtitle={countLabel(designations.reduce((sum, designation) => sum + designation.people.length, 0), "person", "people")} />
          <ul>{designations.map((designation) => <li key={designation.key}><Node tag={`L${designation.level}`} tagClass={section === "OEM" ? "t-oem" : "t-level"} title={designation.people.length ? `${designation.label} (${designation.people.map((person) => person.name).join(", ")})` : designation.label} subtitle={designation.configured?.schedule || (designation.configured ? undefined : "not in Hierarchy master")} /><People people={designation.people} empty="Nobody holds this designation" /></li>)}</ul></li>)}
          {unassigned.length > 0 && <li className="org-root"><Node title="No designation" subtitle="add a designation, department or role to place them" /><People people={unassigned} /></li>}
        </ul></div>
      </article>
    </div>
  </section>;
}
