import React, { useEffect, useId, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { hourlyBreakdownView, breakdownElapsed } from "./hourly-breakdown.mjs";
import "./hourly-breakdown-view.css";

const windowLabel = (hours) => `${hours} ${hours === 1 ? "hour" : "hours"}`;

// Arrow keys move between the window tabs the same way the chart record tabs do.
function moveBetweenTabs(event, index, count, choose) {
  const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (!offset && !["Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (index + offset + count) % count;
  choose(next);
  event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
}

export default function HourlyBreakdownView({ requests, sites, onBack, ActionsTable }) {
  const [hours, setHours] = useState(1);
  const [site, setSite] = useState("");
  const [now, setNow] = useState(Date.now);
  const id = useId();
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const view = hourlyBreakdownView(requests, hours, site, now, sites);
  const siteTabs = [{ site: "", count: view.total }, ...view.siteCounts];
  const title = `${site || "All sites"} · Last ${windowLabel(hours)}`;
  return <section className="hourly-breakdown-view dashboard-record-browser">
    <header className="hourly-breakdown-head">
      <button type="button" className="dashboard-breakdown-day-back hourly-breakdown-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back to Breakdown</button>
      <div className="hourly-breakdown-title">
        <h2>Hourly breakdown activity</h2>
        <p>Activity within the last {windowLabel(hours)}. Active BD timers update automatically; completed BD durations stop at closure.</p>
      </div>
    </header>
    <div className="dashboard-record-controls">
      <div className="dashboard-record-topline">
        <div className="dashboard-record-tabs hourly-breakdown-windows" role="tablist" aria-label="Choose breakdown activity window">
          {view.hourCounts.map((count, index) => <button type="button" key={index} role="tab" id={`${id}-window-${index + 1}`} aria-selected={hours === index + 1} aria-controls={`${id}-records`} tabIndex={hours === index + 1 ? 0 : -1}
            onClick={() => setHours(index + 1)} onKeyDown={(event) => moveBetweenTabs(event, index, view.hourCounts.length, (next) => setHours(next + 1))}><span>{windowLabel(index + 1)}</span><b>{count.toLocaleString()}</b></button>)}
        </div>
      </div>
      <div className="dashboard-record-hierarchy">
        <div className="dashboard-record-level" data-level="site">
          <span className="dashboard-record-level-label">Site</span>
          <div className="dashboard-record-level-navigation" data-scrollable="false">
            <div className="dashboard-record-level-tabs" role="group" aria-label="Filter breakdown activity by site">
              {siteTabs.map((option) => <button type="button" key={option.site} aria-pressed={site === option.site} aria-controls={`${id}-records`} className={option.site ? "" : "dashboard-record-all-tab"} onClick={() => setSite(option.site)}><span>{option.site || "All sites"}</span><b>{option.count.toLocaleString()}</b></button>)}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id={`${id}-records`} className="dashboard-record-results" role="tabpanel" aria-labelledby={`${id}-window-${hours}`}>
      <div className="dashboard-record-summary"><h4>{title}</h4><span role="status" aria-live="polite">{view.rows.length.toLocaleString()} events · Pink: BD In · Green: BD Out</span></div>
      <div className="dashboard-asset-list">
        <ActionsTable key={`${hours}|${site}`} exportTitle={`Hourly breakdown activity · ${title}`} printTitle={`Hourly breakdown activity · ${title}`} recordDateFilter={false}>
          <thead><tr><th>Sites</th><th>Door No</th><th>In/Out</th><th>BD Timing</th></tr></thead>
          <tbody>{view.rows.length ? view.rows.map((row) => <tr key={row.key}>
            <td>{row.site}</td><td>{row.door}</td><td>{row.direction}</td>
            <td className={row.closedAt != null ? "hourly-bd-out" : "hourly-bd-in"} data-sort-value={row.startedAt == null ? "" : Math.max(0, (row.closedAt ?? now) - row.startedAt)}>{breakdownElapsed(row, now)}</td>
          </tr>) : <tr><td colSpan={4}><div className="dashboard-record-empty"><b>No breakdown activity</b><span>No BD In or BD Out events for {site || "any site"} in the last {windowLabel(hours)}.</span></div></td></tr>}</tbody>
        </ActionsTable>
      </div>
    </div>
  </section>;
}
